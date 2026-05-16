import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { startMorningReportTraining } from '@/lib/morning-report';

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
  const { memberType, team } = body;

  const updateData: any = {};
  if (memberType !== undefined) updateData.memberType = memberType;
  if (team !== undefined) updateData.team = team;

  const existingMember = await prisma.telegramMember.findUnique({
    where: { id: memberId },
    select: { memberType: true },
  });

  const member = await prisma.telegramMember.update({
    where: { id: memberId },
    data: updateData,
  });

  if (
    existingMember?.memberType === 'new' &&
    memberType === 'old' &&
    member.registrationStep === null &&
    !member.telegramChatId.startsWith('unverified_')
  ) {
    await startMorningReportTraining(botId, member.telegramChatId);
  }

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

  // Fetch the member first to get their telegramChatId
  const member = await prisma.telegramMember.findUnique({ where: { id: memberId } });
  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Delete onboarding completions for this member first, then delete the member
  await prisma.$transaction([
    prisma.onboardingCompletion.deleteMany({
      where: { botId, telegramChatId: member.telegramChatId },
    }),
    prisma.telegramMember.delete({ where: { id: memberId } }),
  ]);

  return NextResponse.json({ success: true });
}
