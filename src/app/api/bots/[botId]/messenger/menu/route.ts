import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

/**
 * POST /api/bots/[botId]/messenger/menu
 * Pushes the Messenger persistent menu to Facebook's Messenger Profile API.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || !bot.messengerPageToken) {
    return NextResponse.json(
      { error: 'Bot not found or Messenger not connected' },
      { status: 404 }
    );
  }

  // Facebook requires a Get Started button to be set before a persistent menu can be used.
  // We send both get_started and persistent_menu in a single request to avoid error #100.
  // Determine the menu items
  let customItems = (bot.messengerMenu as any[]) || [];
  let menuItems = [];

  if (bot.botType === 'appointment') {
    // Fixed Appointment menu with WebView
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chatbot.local';
    // We don't have PSID here easily for the menu URL, but usually Messenger handles it or we can omit it if not strictly required for initialization
    const calendarUrl = `${appUrl}/webview/calendar/${bot.id}`;
    
    menuItems = [
      { type: 'postback', title: '🏠 အစသို့', payload: 'MENU_HOME' },
      { 
        type: 'web_url', 
        title: '📅 ရက်ချိန်းယူမည်', 
        url: calendarUrl,
        webview_height_ratio: 'tall',
        messenger_extensions: true 
      },
      { type: 'postback', title: '🧾 ရက်ချိန်းစစ်ရန်', payload: 'MENU_CHECK_ORDERS' },
      { type: 'postback', title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' },
    ];
  } else if (bot.botType === 'service') {
    // Fixed Service & Information menu
    menuItems = [
      { type: 'postback', title: '🏠 အစသို့', payload: 'MENU_HOME' },
      { type: 'postback', title: '🛠️ ဝန်ဆောင်မှုများ', payload: 'MENU_VIEW_SERVICES' },
      { type: 'postback', title: '🧾 မှာထားတာတွေစစ်ရန်', payload: 'MENU_CHECK_ORDERS' },
      { type: 'postback', title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' },
    ];
  } else {
    // Fixed E-Commerce menu
    menuItems = [
      { type: 'postback', title: '🏠 အစသို့', payload: 'MENU_HOME' },
      { type: 'postback', title: '📦 ပစ္စည်းများကြည့်ရန်', payload: 'MENU_VIEW_PRODUCTS' },
      { type: 'postback', title: '🛒 Cart ကြည့်ရန်', payload: 'VIEW_CART' },
      { type: 'postback', title: '🧾 မှာထားတာတွေစစ်ရန်', payload: 'MENU_CHECK_ORDERS' },
      { type: 'postback', title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' },
    ];
  }

  const profilePayload = {
    get_started: {
      payload: 'GET_STARTED',
    },
    persistent_menu: [
      {
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: menuItems.slice(0, 5), // Facebook limit is 5 top-level items for standard persistent menu
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${bot.messengerPageToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePayload),
      }
    );

    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('Messenger menu setup error:', data.error);
      return NextResponse.json(
        { error: data.error?.message || 'Failed to set menu' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, result: data });
  } catch (err: any) {
    console.error('Messenger menu error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/bots/[botId]/messenger/menu
 * Removes the Messenger persistent menu.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || !bot.messengerPageToken) {
    return NextResponse.json(
      { error: 'Bot not found or Messenger not connected' },
      { status: 404 }
    );
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${bot.messengerPageToken}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: ['get_started', 'persistent_menu'] }),
      }
    );

    const data = await res.json();

    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: data.error?.message || 'Failed to remove menu' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
