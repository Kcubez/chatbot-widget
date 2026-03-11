import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendTelegramMessage } from '@/lib/telegram';

// POST /api/bots/[botId]/announcements/[announcementId]/broadcast
// Sends the announcement to all OLD members via Telegram
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
    return NextResponse.json({ error: 'No old members to broadcast to', sent: 0 }, { status: 200 });
  }

  const token = bot.telegramBotToken;
  const announcementMessage = `📢 *အသစ် Announcement*\n\n*${announcement.title}*\n\n${announcement.content}\n\n_${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}_`;

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const member of oldMembers) {
    try {
      const res = await sendTelegramMessage(
        token,
        member.telegramChatId,
        announcementMessage,
        // Provide a button to view the announcement inline
        {
          inline_keyboard: [
            [
              {
                text: '✅ ဖတ်ပြီးပါပြီ',
                callback_data: `ann_read:${announcementId}`,
              },
            ],
          ],
        }
      );

      if (res && res.ok) {
        sentCount++;
      } else {
        failedCount++;
        errors.push(`Failed to send to ${member.telegramChatId}`);
      }
    } catch (err) {
      failedCount++;
      errors.push(`Error sending to ${member.telegramChatId}: ${String(err)}`);
    }
  }

  // Mark announcement as sent
  await prisma.announcement.update({
    where: { id: announcementId },
    data: {
      isSent: true,
      sentAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    sent: sentCount,
    failed: failedCount,
    total: oldMembers.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// DELETE /api/bots/[botId]/announcements/[announcementId]
export async function DELETE(
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

  await prisma.announcement.delete({ where: { id: announcementId } });
  return NextResponse.json({ success: true });
}
