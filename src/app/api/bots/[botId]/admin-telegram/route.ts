import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAdminBotUpdate } from '@/lib/admin-bot';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  // Parse body and params synchronously, then respond IMMEDIATELY
  // This prevents Telegram from retrying the webhook (30s timeout)
  const [{ botId }, update] = await Promise.all([
    params,
    req.json(),
  ]);

  // Run entire handler in background — don't block the HTTP response
  (async () => {
    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
        include: { user: true },
      });

      if (!bot || !bot.adminBotToken) {
        console.warn('[ADMIN_BOT_WEBHOOK] Bot not found or no admin token:', botId);
        return;
      }

      await handleAdminBotUpdate(bot, bot.adminBotToken, update);
    } catch (err) {
      console.error('[ADMIN_BOT_WEBHOOK] Error:', err);
    }
  })();

  // Respond instantly — Telegram gets 200 OK in <50ms
  return NextResponse.json({ ok: true });
}
