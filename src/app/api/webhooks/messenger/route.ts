import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  sendMessengerMessage,
  sendMessengerTyping,
  sendMessengerQuickReplies,
  sendMessengerGenericTemplate,
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
        if (event.message?.attachments) {
          await handleAttachment(bot, token, senderId, event.message.attachments);
        } else if (event.message?.text) {
          await handleTextMessage(bot, token, senderId, event.message.text);
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

// ─── Handle attachments ───
async function handleAttachment(bot: any, token: string, senderId: string, attachments: any[]) {
  const session = await getSession(bot.id, senderId);

  if (session.state === 'collecting_payment_screenshot') {
    const pending = (session.pendingData as any) || {};
    await finishOrder(
      bot,
      token,
      senderId,
      session,
      pending.township || 'Unknown',
      pending.deliveryFee || 0,
      'Bank Transfer/KPay'
    );
    return;
  }

  // default attachment handling
  await sendMessengerMessage(token, senderId, '🙏 ပုံလက်ခံရရှိပါတယ်။ ဘာကူညီပေးရမလဲ?');
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
    await updateSession(session.id, {
      state: 'collecting_payment_method',
      pendingData: {
        ...((session.pendingData as any) || {}),
        township: text.trim(),
        deliveryFee: 0,
      },
    });
    await sendMessengerQuickReplies(token, senderId, '💳 ငွေပေးချေမှုကို မည်သို့ပြုလုပ်မည်နည်း?', [
      { title: '💵 အိမ်ရောက်မှငွေချေ (COD)', payload: 'PAY_COD' },
      { title: '🏦 Bank Transfer / KPay', payload: 'PAY_BANK' },
    ]);
    return;
  }

  if (session.state === 'collecting_payment_screenshot') {
    const pending = (session.pendingData as any) || {};
    await finishOrder(
      bot,
      token,
      senderId,
      session,
      pending.township || 'Unknown',
      pending.deliveryFee || 0,
      'Bank Transfer/KPay'
    );
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

  const productsByCategory: Record<string, any[]> = {};
  products.forEach((p: any) => {
    const cat = p.category || 'General';
    if (!productsByCategory[cat]) productsByCategory[cat] = [];
    productsByCategory[cat].push(p);
  });

  const productContext =
    products.length > 0
      ? `\n\n📦 PRODUCT CATALOG:\n${Object.entries(productsByCategory)
          .map(
            ([cat, items]) =>
              `【${cat}】\n${(items as any[])
                .map(
                  (p: any) =>
                    `  • ${p.name} — ${p.price.toLocaleString()} Ks ${p.stockCount > 0 ? `(${p.stockCount} in stock ✅)` : '(OUT OF STOCK ❌)'}${p.description ? ` | ${p.description}` : ''}`
                )
                .join('\n')}`
          )
          .join('\n')}`
      : '\n\n⚠️ No products available yet.';

  const deliveryZones = await prisma.deliveryZone.findMany({
    where: { botId: bot.id, isActive: true },
  });

  const deliveryContext =
    deliveryZones.length > 0
      ? `\n\n🚚 DELIVERY ZONES:\n${deliveryZones.map((z: any) => `  • ${z.township} (${z.city}) — ${z.fee.toLocaleString()} Ks`).join('\n')}`
      : '';

  const cartContext = session.cart
    ? `\n\n🛒 CUSTOMER'S CURRENT CART: ${JSON.stringify(session.cart)}`
    : '';

  const systemContext = `${productContext}${deliveryContext}${cartContext}

CRITICAL RULES:
1. You are a Myanmar e-commerce sales assistant on Facebook Messenger
2. ALWAYS respond in Myanmar (Burmese). If customer writes English, respond in English
3. Keep responses SHORT (3-4 lines max). This is Messenger, not email
4. Show products with: name, price, key feature. Use emoji for readability
5. When customer wants to buy/order, respond with [ORDER:exact_product_name:quantity] at the END
   Example: [ORDER:AirPods Pro 2nd Gen:1]
6. When customer asks to see products, list, catalog or 'new products', reply with [SHOW_PRODUCTS] at the END
7. NEVER invent products or prices not in the catalog above
8. If OUT OF STOCK, suggest similar alternatives
9. Be warm, professional, and helpful. Use ခင်ဗျာ/ရှင် politely`;

  const aiResponse = await generateBotResponse(bot.id, text + '\n\n' + systemContext, [], 'web');

  const cleanMsg = aiResponse
    .replace(/\[ORDER:.+?\]/g, '')
    .replace(/\[SHOW_PRODUCTS\]/g, '')
    .trim();

  const isOrderTrigger = !!aiResponse.match(/\[ORDER:(.+?):(\d+)\]/);
  const isShowProducts =
    aiResponse.includes('[SHOW_PRODUCTS]') ||
    lowerText === 'new products' ||
    lowerText === 'products';

  // ── Send clean AI text message ──
  if (cleanMsg && !isOrderTrigger) {
    // After normal replies, append a "View Products" quick reply shortcut
    if (!isShowProducts && products.length > 0) {
      await sendMessengerQuickReplies(token, senderId, cleanMsg, [
        { title: '📦 ပစ္စည်းများ', payload: 'SHOW_ALL_PRODUCTS' },
      ]);
    } else {
      await sendMessengerMessage(token, senderId, cleanMsg);
    }
  }

  // ── Product carousel trigger ──
  if (isShowProducts) {
    if (products.length > 0) {
      const elements = products.slice(0, 10).map((p: any) => ({
        title: p.name,
        subtitle: `${p.price.toLocaleString()} MMK ~ ${p.price.toLocaleString()} MMK\n${p.category}${p.stockCount > 0 ? '' : ' (Out of stock)'}`,
        image_url: p.image || 'https://placehold.co/600x600/f4f4f5/a1a1aa?text=No+Image',
        buttons: [
          { type: 'postback', title: 'Order', payload: `ORDER_${p.id}` },
          { type: 'postback', title: 'View Detail', payload: `DETAIL_${p.id}` },
        ],
      }));
      await sendMessengerGenericTemplate(token, senderId, elements);
    } else {
      await sendMessengerMessage(token, senderId, '🙏 လောလောဆယ် ပစ္စည်းများ မရှိသေးပါ။');
    }
    return;
  }

  // ── Order trigger ──
  if (isOrderTrigger) {
    const orderMatch = aiResponse.match(/\[ORDER:(.+?):(\d+)\]/);
    if (!orderMatch) return;
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

      const confirmMsg = `${cleanMsg ? cleanMsg + '\n\n' : ''}📋 Order အတည်ပြုပါ:\n🛒 ${product.name} x${qty}\n💰 ${subtotal.toLocaleString()} Ks\n\nOrder တင်မှာ သေချာပါသလား?`;
      await sendMessengerQuickReplies(token, senderId, confirmMsg, [
        { title: '✅ အတည်ပြု', payload: 'CONFIRM_ORDER' },
        { title: '❌ ပယ်ဖျက်', payload: 'CANCEL_ORDER' },
      ]);
      return;
    } else if (product && product.stockCount < qty) {
      await sendMessengerMessage(
        token,
        senderId,
        `${cleanMsg ? cleanMsg + '\n\n' : ''}⚠️ ${product.name} - လက်ကျန် ${product.stockCount} ခုပဲ ရှိတော့ပါတယ်။`
      );
      return;
    }
  }
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

  if (payload === 'SHOW_ALL_PRODUCTS') {
    const products = await prisma.product.findMany({
      where: { botId: bot.id, isActive: true },
    });
    if (products.length > 0) {
      const elements = products.slice(0, 10).map((p: any) => ({
        title: p.name,
        subtitle: `${p.price.toLocaleString()} MMK ~ ${p.price.toLocaleString()} MMK\n${p.category}${p.stockCount > 0 ? '' : ' (Out of stock)'}`,
        image_url: p.image || 'https://placehold.co/600x600/f4f4f5/a1a1aa?text=No+Image',
        buttons: [
          { type: 'postback', title: 'Order', payload: `ORDER_${p.id}` },
          { type: 'postback', title: 'View Detail', payload: `DETAIL_${p.id}` },
        ],
      }));
      await sendMessengerGenericTemplate(token, senderId, elements);
    } else {
      await sendMessengerMessage(token, senderId, '🙏 လောလောဆယ် ပစ္စည်းများ မရှိသေးပါ။');
    }
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
      await updateSession(session.id, {
        state: 'collecting_payment_method',
        pendingData: {
          ...((session.pendingData as any) || {}),
          township: zone.township,
          deliveryFee: zone.fee,
        },
      });
      await sendMessengerQuickReplies(
        token,
        senderId,
        '💳 ငွေပေးချေမှုကို မည်သို့ပြုလုပ်မည်နည်း?',
        [
          { title: '💵 အိမ်ရောက်မှငွေချေ (COD)', payload: 'PAY_COD' },
          { title: '🏦 Bank Transfer / KPay', payload: 'PAY_BANK' },
        ]
      );
    }
    return;
  }

  if (payload === 'PAY_COD') {
    const pending = (session.pendingData as any) || {};
    await finishOrder(
      bot,
      token,
      senderId,
      session,
      pending.township || 'Unknown',
      pending.deliveryFee || 0,
      'COD'
    );
    return;
  }

  if (payload === 'PAY_BANK') {
    await updateSession(session.id, {
      state: 'collecting_payment_screenshot',
      pendingData: {
        ...((session.pendingData as any) || {}),
        paymentMethod: 'Bank Transfer/KPay',
      },
    });
    await sendMessengerMessage(
      token,
      senderId,
      '🏦 Bank Transfer သို့မဟုတ် K Pay ဖြင့် ငွေလွှဲထားသော Screenshot သို့မဟုတ် Transaction အချက်အလက်များကို ပေးပို့ပေးပါခင်ဗျာ။'
    );
    return;
  }

  if (payload.startsWith('ORDER_')) {
    const productId = payload.replace('ORDER_', '');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (product && product.stockCount > 0) {
      await updateSession(session.id, {
        state: 'confirming',
        cart: [{ productId: product.id, name: product.name, price: product.price, qty: 1 }],
        pendingData: { subtotal: product.price },
      });
      const confirmMsg = `📋 Order အတည်ပြုပါ:\n🛒 ${product.name} x1\n💰 ${product.price.toLocaleString()} Ks\n\nOrder တင်မှာ သေချာပါသလား?`;
      await sendMessengerQuickReplies(token, senderId, confirmMsg, [
        { title: '✅ အတည်ပြု', payload: 'CONFIRM_ORDER' },
        { title: '❌ ပယ်ဖျက်', payload: 'CANCEL_ORDER' },
      ]);
    } else if (product) {
      await sendMessengerMessage(token, senderId, `⚠️ ${product.name} သည် လက်ကျန် မရှိတော့ပါ။`);
    }
    return;
  }

  if (payload.startsWith('DETAIL_')) {
    const productId = payload.replace('DETAIL_', '');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (product) {
      const msg = `📦 ${product.name}\n🔖 Category: ${product.category}\n💰 Price: ${product.price.toLocaleString()} Ks\n${product.description ? `\n📝 ${product.description}` : ''}`;
      await sendMessengerMessage(token, senderId, msg);
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
  deliveryFee: number,
  paymentMethod: string = 'COD'
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
      paymentMethod,
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
    `👤 ${pending.customerName || '-'}\n📱 ${pending.customerPhone || '-'}\n🏠 ${pending.customerAddress || '-'}\n🏘️ ${township}\n💳 ငွေချေစနစ်: ${paymentMethod}\n\n` +
    `📦 ပစ္စည်းများ:\n${itemLines}\n\n` +
    `💰 ပစ္စည်းတန်ဖိုး: ${subtotal.toLocaleString()} Ks\n🚗 Delivery: ${deliveryFee.toLocaleString()} Ks\n💵 စုစုပေါင်း: ${total.toLocaleString()} Ks\n\n` +
    (paymentMethod === 'Bank Transfer/KPay'
      ? `📸 ငွေလွှဲအချက်အလက်များကို လက်ခံရရှိပါပြီ။\n📞 ကျနော်တို့ဘက်ကနေ စစ်ဆေးပြီး ဖုန်းဆက် အကြောင်းပြန်ကြားပေးပါမယ်ခင်ဗျာ။\n🙏 ဝယ်ယူအားပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်!`
      : `📞 ဆိုင်ဘက်ကနေ ဖုန်းဆက်ပြီး အတည်ပြုပေးပါမယ်\n🙏 ဝယ်ယူအားပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်!`);

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
