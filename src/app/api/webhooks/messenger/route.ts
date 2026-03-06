import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  sendMessengerMessage,
  sendMessengerTyping,
  sendMessengerQuickReplies,
} from '@/lib/messenger';
import { generateBotResponse } from '@/lib/ai';
import { syncOrderToSheet } from '@/lib/sheets';

// ─── GET: Facebook webhook verification ───
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('Webhook verify attempt:', { mode, token: token?.slice(0, 8) + '...' });

  if (mode === 'subscribe' && token) {
    // Strategy 1: database
    const bot = await prisma.bot.findFirst({
      where: { messengerVerifyToken: token },
    });
    if (bot) {
      console.log('Webhook verified via DB for bot:', bot.name);
      return new NextResponse(challenge, { status: 200 });
    }

    // Strategy 2: env var
    const envToken = process.env.MESSENGER_VERIFY_TOKEN;
    if (envToken && token === envToken) {
      console.log('Webhook verified via env MESSENGER_VERIFY_TOKEN');
      return new NextResponse(challenge, { status: 200 });
    }

    // Strategy 3: app secret fallback
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (appSecret && token === appSecret) {
      console.log('Webhook verified via FACEBOOK_APP_SECRET');
      return new NextResponse(challenge, { status: 200 });
    }

    console.log('Webhook verification failed: no matching token');
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// ─── POST: Handle incoming messages ───
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.object !== 'page') {
      return new NextResponse('OK', { status: 200 });
    }

    for (const entry of body.entry || []) {
      const pageId = entry.id;
      const bot = await prisma.bot.findFirst({
        where: { messengerPageId: pageId, messengerEnabled: true },
        include: { documents: true },
      });
      if (!bot || !bot.messengerPageToken) continue;

      const token = bot.messengerPageToken;

      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        if (!senderId || senderId === pageId) continue;

        if (event.postback) {
          await handlePostback(bot, token, senderId, event.postback.payload);
          continue;
        }
        if (event.message?.quick_reply) {
          await handlePostback(bot, token, senderId, event.message.quick_reply.payload);
          continue;
        }
        if (event.message?.text) {
          await handleTextMessage(bot, token, senderId, event.message.text);
          continue;
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Messenger webhook error:', error);
    return new NextResponse('OK', { status: 200 });
  }
}

// ─── Session helpers ───
async function getSession(botId: string, senderId: string) {
  return prisma.messengerSession.upsert({
    where: { botId_messengerSenderId: { botId, messengerSenderId: senderId } },
    create: { botId, messengerSenderId: senderId, state: 'browsing' },
    update: {},
  });
}

async function updateSession(id: string, data: any) {
  return prisma.messengerSession.update({ where: { id }, data });
}

// ─── Handle text messages ───
async function handleTextMessage(bot: any, token: string, senderId: string, text: string) {
  const session = await getSession(bot.id, senderId);
  const lowerText = text.trim().toLowerCase();

  // ── State machine for info collection ──
  if (session.state === 'collecting_name') {
    await updateSession(session.id, {
      state: 'collecting_phone',
      pendingData: { ...((session.pendingData as any) || {}), customerName: text.trim() },
    });
    await sendMessengerMessage(
      token,
      senderId,
      `✅ အမည်: ${text.trim()}\n\n📱 ဖုန်းနံပါတ် ထည့်ပေးပါ`
    );
    return;
  }

  if (session.state === 'collecting_phone') {
    await updateSession(session.id, {
      state: 'collecting_address',
      pendingData: { ...((session.pendingData as any) || {}), customerPhone: text.trim() },
    });
    await sendMessengerMessage(
      token,
      senderId,
      `✅ ဖုန်း: ${text.trim()}\n\n🏠 လိပ်စာ ထည့်ပေးပါ (ရပ်ကွက်/လမ်း/အိမ်အမှတ်)`
    );
    return;
  }

  if (session.state === 'collecting_address') {
    await updateSession(session.id, {
      state: 'collecting_township',
      pendingData: { ...((session.pendingData as any) || {}), customerAddress: text.trim() },
    });

    const zones = await prisma.deliveryZone.findMany({
      where: { botId: bot.id, isActive: true },
      orderBy: { township: 'asc' },
    });

    if (zones.length > 0) {
      const quickReplies = zones.slice(0, 13).map((z: any) => ({
        title: `${z.township} (${z.fee.toLocaleString()} Ks)`,
        payload: `TOWNSHIP_${z.id}`,
      }));
      await sendMessengerQuickReplies(token, senderId, '🏘️ မြို့နယ် ရွေးပေးပါ', quickReplies);
    } else {
      await sendMessengerMessage(token, senderId, '🏘️ မြို့နယ် ရိုက်ထည့်ပေးပါ');
    }
    return;
  }

  if (session.state === 'collecting_township') {
    await finishOrder(bot, token, senderId, session, text.trim(), 0);
    return;
  }

  // ── Cancel ──
  if (lowerText === 'cancel' || lowerText === 'ပယ်ဖျက်') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendMessengerMessage(token, senderId, '❌ ပယ်ဖျက်လိုက်ပါပြီ။ ဘာကူညီပေးရမလဲ?');
    return;
  }

  // ── AI Chat with product context ──
  await sendMessengerTyping(token, senderId);

  const products = await prisma.product.findMany({
    where: { botId: bot.id, isActive: true },
  });

  const productContext =
    products.length > 0
      ? `\n\nAvailable Products:\n${products
          .map(
            (p: any) =>
              `- ${p.name} | Price: ${p.price.toLocaleString()} Ks | Stock: ${p.stockCount > 0 ? `${p.stockCount} available` : 'OUT OF STOCK'} | Category: ${p.category}${p.description ? ` | ${p.description}` : ''}`
          )
          .join('\n')}`
      : '';

  const deliveryZones = await prisma.deliveryZone.findMany({
    where: { botId: bot.id, isActive: true },
  });

  const deliveryContext =
    deliveryZones.length > 0
      ? `\n\nDelivery Zones:\n${deliveryZones.map((z: any) => `- ${z.township} (${z.city}): ${z.fee.toLocaleString()} Ks`).join('\n')}`
      : '';

  const systemContext = `${productContext}${deliveryContext}

IMPORTANT INSTRUCTIONS:
- You are a sales assistant chatbot for a Myanmar e-commerce business
- Respond in Myanmar language (Burmese) by default
- When customer asks about products, show them from the list above
- When customer wants to order, tell them the product details, price, and availability
- If product is OUT OF STOCK, tell customer it's not available
- If customer confirms they want to order, respond with EXACTLY this format at the end: [ORDER:product_name:quantity]
- Example: [ORDER:iPhone 15:1]
- Keep responses friendly, helpful, and professional
- Do NOT make up products that don't exist in the list`;

  const aiResponse = await generateBotResponse(bot.id, text + '\n\n' + systemContext, [], 'web');

  // Check for order trigger
  const orderMatch = aiResponse.match(/\[ORDER:(.+?):(\d+)\]/);
  if (orderMatch) {
    const productName = orderMatch[1].trim();
    const qty = parseInt(orderMatch[2]) || 1;

    const product = products.find(
      (p: any) =>
        p.name.toLowerCase().includes(productName.toLowerCase()) ||
        productName.toLowerCase().includes(p.name.toLowerCase())
    );

    if (product && product.stockCount >= qty) {
      const cartItems = [{ productId: product.id, name: product.name, price: product.price, qty }];
      const subtotal = product.price * qty;

      await updateSession(session.id, {
        state: 'confirming',
        cart: cartItems,
        pendingData: { subtotal },
      });

      const cleanResponse = aiResponse.replace(/\[ORDER:.+?\]/, '').trim();
      const confirmMsg = `${cleanResponse}\n\n📋 Order အတည်ပြုပါ:\n🛒 ${product.name} x${qty}\n💰 ${subtotal.toLocaleString()} Ks\n\nOrder တင်မှာ သေချာပါသလား?`;

      await sendMessengerQuickReplies(token, senderId, confirmMsg, [
        { title: '✅ အတည်ပြု', payload: 'CONFIRM_ORDER' },
        { title: '❌ ပယ်ဖျက်', payload: 'CANCEL_ORDER' },
      ]);
      return;
    } else if (product && product.stockCount < qty) {
      const cleanResponse = aiResponse.replace(/\[ORDER:.+?\]/, '').trim();
      await sendMessengerMessage(
        token,
        senderId,
        `${cleanResponse}\n\n⚠️ ${product.name} - လက်ကျန် ${product.stockCount} ခုပဲ ရှိတော့ပါတယ်။`
      );
      return;
    }
  }

  const cleanMsg = aiResponse.replace(/\[ORDER:.+?\]/g, '').trim();
  await sendMessengerMessage(token, senderId, cleanMsg);
}

// ─── postback / quick reply ───
async function handlePostback(bot: any, token: string, senderId: string, payload: string) {
  const session = await getSession(bot.id, senderId);

  if (payload === 'CONFIRM_ORDER') {
    await updateSession(session.id, { state: 'collecting_name' });
    await sendMessengerMessage(
      token,
      senderId,
      '🎉 Order အတည်ပြုပြီးပါပြီ!\n\n📝 Delivery အတွက် အချက်အလက်တွေ လိုပါမယ်\n\n👤 အမည် ထည့်ပေးပါ'
    );
    return;
  }

  if (payload === 'CANCEL_ORDER') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendMessengerMessage(token, senderId, '❌ Order ပယ်ဖျက်လိုက်ပါပြီ။\n\nဘာကူညီပေးရမလဲ? 😊');
    return;
  }

  if (payload.startsWith('TOWNSHIP_')) {
    const zoneId = payload.replace('TOWNSHIP_', '');
    const zone = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    if (zone) {
      await finishOrder(bot, token, senderId, session, zone.township, zone.fee);
    }
    return;
  }

  await handleTextMessage(bot, token, senderId, payload);
}

// ─── Finish order ───
async function finishOrder(
  bot: any,
  token: string,
  senderId: string,
  session: any,
  township: string,
  deliveryFee: number
) {
  const cart = (session.cart as any[]) || [];
  const pending = (session.pendingData as any) || {};
  const subtotal =
    pending.subtotal || cart.reduce((sum: number, item: any) => sum + item.price * item.qty, 0);
  const total = subtotal + deliveryFee;

  const order = await prisma.order.create({
    data: {
      botId: bot.id,
      messengerSenderId: senderId,
      customerName: pending.customerName || null,
      customerPhone: pending.customerPhone || null,
      customerAddress: pending.customerAddress || null,
      customerTownship: township,
      items: cart,
      subtotal,
      deliveryFee,
      total,
      status: 'confirmed',
    },
  });

  for (const item of cart) {
    await prisma.product.update({
      where: { id: item.productId },
      data: { stockCount: { decrement: item.qty } },
    });
  }

  await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });

  const itemLines = cart
    .map(
      (item: any) =>
        `  🛒 ${item.name} x${item.qty} = ${(item.price * item.qty).toLocaleString()} Ks`
    )
    .join('\n');

  const confirmationMsg =
    `✅ Order #${order.id.slice(-6).toUpperCase()} တင်ပြီးပါပြီ!\n\n` +
    `👤 ${pending.customerName || '-'}\n📱 ${pending.customerPhone || '-'}\n🏠 ${pending.customerAddress || '-'}\n🏘️ ${township}\n\n` +
    `📦 ပစ္စည်းများ:\n${itemLines}\n\n` +
    `💰 ပစ္စည်းတန်ဖိုး: ${subtotal.toLocaleString()} Ks\n🚗 Delivery: ${deliveryFee.toLocaleString()} Ks\n💵 စုစုပေါင်း: ${total.toLocaleString()} Ks\n\n` +
    `📞 ဆိုင်ဘက်ကနေ ဖုန်းဆက်ပြီး အတည်ပြုပေးပါမယ်\n🙏 ဝယ်ယူအားပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်!`;

  await sendMessengerMessage(token, senderId, confirmationMsg);

  // Google Sheets sync
  if (bot.googleSheetId) {
    try {
      const synced = await syncOrderToSheet(
        bot.googleSheetId,
        bot.googleSheetName || 'Orders',
        order
      );
      if (synced) {
        await prisma.order.update({ where: { id: order.id }, data: { sheetSynced: true } });
      }
    } catch (err) {
      console.error('Sheets sync failed:', err);
    }
  }
}
