import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// PATCH update Telegram-specific settings
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { botId } = await params;
    const body = await req.json();

    // Check ownership
    const bot = await prisma.bot.findUnique({
      where: { id: botId, userId: session.user.id },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // White-list fields for Telegram
    const {
      telegramWelcomeMessage,
      telegramContactMessage,
      telegramPaymentMessage,
      telegramMenu,
      telegramBotToken,
      storeName
    } = body;

    const updateData: any = {};
    if (telegramWelcomeMessage !== undefined) updateData.telegramWelcomeMessage = telegramWelcomeMessage;
    if (telegramContactMessage !== undefined) updateData.telegramContactMessage = telegramContactMessage;
    if (telegramPaymentMessage !== undefined) updateData.telegramPaymentMessage = telegramPaymentMessage;
    if (telegramMenu !== undefined) updateData.telegramMenu = telegramMenu;
    if (telegramBotToken !== undefined) updateData.telegramBotToken = telegramBotToken;
    if (storeName !== undefined) updateData.storeName = storeName;

    const updatedBot = await prisma.bot.update({
      where: { id: botId },
      data: updateData,
    });

    return NextResponse.json(updatedBot);
  } catch (error) {
    console.error('[TELEGRAM_PATCH]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
