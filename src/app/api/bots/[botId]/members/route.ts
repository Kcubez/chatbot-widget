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
    where: { botId },
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

// POST /api/bots/[botId]/members — manually add a member
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
  const { telegramChatId, telegramUsername, firstName, lastName, memberType } = body;

  if (!telegramChatId) {
    return NextResponse.json({ error: 'telegramChatId required' }, { status: 400 });
  }

  const member = await prisma.telegramMember.upsert({
    where: { botId_telegramChatId: { botId, telegramChatId: String(telegramChatId) } },
    create: {
      botId,
      telegramChatId: String(telegramChatId),
      telegramUsername: telegramUsername || null,
      firstName: firstName || null,
      lastName: lastName || null,
      memberType: memberType || 'new',
    },
    update: {
      telegramUsername: telegramUsername || null,
      firstName: firstName || null,
      lastName: lastName || null,
      memberType: memberType || 'new',
    },
  });

  return NextResponse.json({ member });
}
