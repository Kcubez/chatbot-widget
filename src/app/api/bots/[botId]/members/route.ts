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

  return NextResponse.json({ members });
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
