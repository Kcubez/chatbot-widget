import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAdminBotUpdate } from '@/lib/admin-bot';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;

    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { user: true },
    });

    if (!bot || !bot.adminBotToken) {
      return NextResponse.json({ error: 'Bot not found or no admin token' }, { status: 404 });
    }

    const update = await req.json();

    // Process in background (don't block Telegram)
    handleAdminBotUpdate(bot, bot.adminBotToken, update).catch(err => {
      console.error('[ADMIN_BOT_WEBHOOK] Error:', err);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ADMIN_BOT_WEBHOOK]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
