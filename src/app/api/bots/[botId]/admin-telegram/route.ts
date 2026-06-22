import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAdminBotUpdate } from '@/lib/admin-bot';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  const [{ botId }, update] = await Promise.all([
    params,
    req.json(),
  ]);

  try {
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { user: true },
    });

    if (!bot || !bot.adminBotToken) {
      console.warn('[ADMIN_BOT_WEBHOOK] Bot not found or no admin token:', botId);
      return NextResponse.json({ ok: false, error: 'Bot or admin token not found' }, { status: 404 });
    }

    await handleAdminBotUpdate(bot, bot.adminBotToken, update);
  } catch (err) {
    console.error('[ADMIN_BOT_WEBHOOK] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
