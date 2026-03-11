import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// PATCH /api/bots/[botId]/members/[memberId] — update member type
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; memberId: string }> }
) {
  const { botId, memberId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const { memberType } = body;

  const member = await prisma.telegramMember.update({
    where: { id: memberId },
    data: { memberType },
  });

  return NextResponse.json({ member });
}

// DELETE /api/bots/[botId]/members/[memberId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; memberId: string }> }
) {
  const { botId, memberId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.telegramMember.delete({ where: { id: memberId } });
  return NextResponse.json({ success: true });
}
