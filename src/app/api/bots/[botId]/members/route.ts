import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// GET /api/bots/[botId]/members — list all members
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const members = await prisma.telegramMember.findMany({
    where: {
      botId,
      // Only show: verified members OR admin-created pending members
      // Hide temp tracking records (awaiting_email + real chatId)
      OR: [
        { registrationStep: null },                          // Verified members
        { telegramChatId: { startsWith: 'unverified_' } },   // Admin-created pending
      ],
    },
    orderBy: { joinedAt: 'desc' },
  });

  const completions = await prisma.onboardingCompletion.findMany({
    where: { botId },
  });

  const totalSteps =
    bot.onboardingEnabled && bot.onboardingTopics ? (bot.onboardingTopics as any[]).length : 0;

  const enrichedMembers = members.map(m => {
    if (m.memberType !== 'old') {
      const userCompletions = completions.filter(c => c.telegramChatId === m.telegramChatId);
      const isComplete = totalSteps > 0 && userCompletions.length >= totalSteps;
      return {
        ...m,
        completedSteps: userCompletions.length,
        totalSteps,
        isComplete,
      };
    }
    return m;
  });

  return NextResponse.json({ members: enrichedMembers });
}

// POST /api/bots/[botId]/members — admin pre-registers a member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const { firstName, email, memberType, team, workType } = body;

  if (!firstName || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }

  // Check if email already exists for this bot
  const existing = await prisma.telegramMember.findFirst({
    where: { botId, email },
  });
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  // Create with placeholder chatId (will be updated when user verifies via Telegram)
  const placeholderChatId = `unverified_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const member = await prisma.telegramMember.create({
    data: {
      botId,
      telegramChatId: placeholderChatId,
      firstName: firstName.trim(),
      email: email.trim().toLowerCase(),
      memberType: memberType || 'new',
      team: team || null, // "MOT" | "MOE" | null
      workType: workType || 'office', // "office" | "wfh"
      registrationStep: 'awaiting_verification', // Not yet linked to Telegram
    },
  });

  return NextResponse.json({ member });
}
