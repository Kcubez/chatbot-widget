import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// GET /api/bots/[botId]/announcements/[announcementId]/reads
// Returns list of employees who have read this announcement
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; announcementId: string }> }
) {
  const { botId, announcementId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const reads = await prisma.announcementRead.findMany({
    where: { announcementId },
    include: {
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          telegramUsername: true,
          telegramChatId: true,
          team: true,
          workType: true,
          email: true,
        },
      },
    },
    orderBy: { readAt: 'desc' },
  });

  // Also get total old members for context (how many should read)
  const totalOldMembers = await prisma.telegramMember.count({
    where: { botId, memberType: 'old' },
  });

  return NextResponse.json({
    reads,
    totalRecipients: totalOldMembers,
    readCount: reads.length,
  });
}
