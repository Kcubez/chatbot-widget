import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// POST to update/push Telegram menu
export async function POST(
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
    const bot = await prisma.bot.findUnique({
      where: { id: botId, userId: session.user.id },
    });

    if (!bot || !bot.telegramBotToken) {
      return NextResponse.json({ error: 'Bot or token not found' }, { status: 404 });
    }

    // Default menu items based on bot type
    const menuItems = 
      bot.botType === 'appointment' ? [
        { command: 'start', description: '🏠 အစသို့ (Home)' },
        { command: 'view_services', description: '📅 ရက်ချိန်းယူမည် (Book Appointment)' },
        { command: 'check_orders', description: '🧾 ရက်ချိန်းစစ်ရန် (Check Appointment)' },
        { command: 'contact_us', description: '📞 ဆက်သွယ်ရန် (Contact Us)' },
      ] : bot.botType === 'service' ? [
        { command: 'start', description: '🏠 အစသို့ (Home)' },
        { command: 'view_services', description: '🛠️ ဝန်ဆောင်မှုများ (Services)' },
        { command: 'check_orders', description: '🧾 မှာထားတာတွေစစ်ရန် (Check Orders)' },
        { command: 'contact_us', description: '📞 ဆက်သွယ်ရန် (Contact Us)' },
      ] : [
        { command: 'start', description: '🏠 အစသို့ (Home)' },
        { command: 'view_products', description: '📦 ပစ္စည်းများကြည့်ရန် (Products)' },
        { command: 'view_cart', description: '🛒 Cart ကြည့်ရန် (Cart)' },
        { command: 'check_orders', description: '🧾 မှာထားတာတွေစစ်ရန် (Check Orders)' },
        { command: 'contact_us', description: '📞 ဆက်သွယ်ရန် (Contact Us)' },
      ];

    // Push to Telegram API
    const response = await fetch(`https://api.telegram.org/bot${bot.telegramBotToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: menuItems }),
    });

    const resData = await response.json();

    if (resData.ok) {
      return NextResponse.json({ success: true, commands: menuItems });
    } else {
      return NextResponse.json({ error: resData.description || 'Failed to push to Telegram' }, { status: 400 });
    }
  } catch (error) {
    console.error('[TELEGRAM_MENU_PUSH]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE to remove Telegram menu commands
export async function DELETE(
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
    const bot = await prisma.bot.findUnique({
      where: { id: botId, userId: session.user.id },
    });

    if (!bot || !bot.telegramBotToken) {
      return NextResponse.json({ error: 'Bot or token not found' }, { status: 404 });
    }

    // Push empty commands to Telegram to remove menu
    const response = await fetch(`https://api.telegram.org/bot${bot.telegramBotToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [] }),
    });

    const resData = await response.json();

    if (resData.ok) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: resData.description || 'Failed to remove Telegram menu' }, { status: 400 });
    }
  } catch (error) {
    console.error('[TELEGRAM_MENU_DELETE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
