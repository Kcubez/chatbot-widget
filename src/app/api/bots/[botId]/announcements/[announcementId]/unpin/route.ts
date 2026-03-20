import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { unpinTelegramMessage } from '@/lib/telegram';

// POST /api/bots/[botId]/announcements/[announcementId]/unpin
// Unpins the latest message for all OLD members via Telegram
export async function POST(
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

  if (!bot.telegramBotToken) {
    return NextResponse.json({ error: 'Telegram bot token not configured' }, { status: 400 });
  }

  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
  });

  if (!announcement || announcement.botId !== botId) {
    return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
  }

  // Get all OLD members
  const oldMembers = await prisma.telegramMember.findMany({
    where: { botId, memberType: 'old' },
  });

  if (oldMembers.length === 0) {
    return NextResponse.json({ error: 'No old members to unpin from', success: true }, { status: 200 });
  }

  const token = bot.telegramBotToken;

  let successCount = 0;
  let failedCount = 0;

  for (const member of oldMembers) {
    try {
      // Unpin the most recent pinned message in each chat
      const data = await unpinTelegramMessage(token, member.telegramChatId);
      if (data && data.ok) {
        successCount++;
      } else {
        failedCount++;
      }
    } catch (err) {
      failedCount++;
      console.error(`Error unpinning for ${member.telegramChatId}:`, err);
    }
  }

  // Update database state
  await prisma.announcement.update({
    where: { id: announcementId },
    data: { isPinned: false },
  });

  return NextResponse.json({
    success: true,
    unpinned: successCount,
    failed: failedCount,
    total: oldMembers.length,
  });
}
