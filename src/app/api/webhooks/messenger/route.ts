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
        include: {
          documents: true,
          messengerAutoReplies: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
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
          continue;
        }
        if (event.message?.text) {
          await handleIncomingText(bot, token, senderId, event.message.text);
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

function getBankInfoMessage(bot: any) {
  if (bot.messengerPaymentMessage) {
    return bot.messengerPaymentMessage;
  }

  const docs = bot.documents || [];
  const bankDoc = docs.find(
    (d: any) =>
      d.title.toLowerCase().includes('bank') ||
      d.title.toLowerCase().includes('payment') ||
      d.title.toLowerCase().includes('pay')
  );
  const prompt =
    '🏦 ငွေလွှဲရန် အချက်အလက်များ:\n1. KBZ Pay (KPay)\nAccount Name: Your Shop Name\nPhone Number: 09-123456789\n\n2. Wave Pay\nAccount Name: Your Shop Name\nPhone Number: 09-123456789\n\n3. KBZ Bank\nAccount Name: Your Shop Name\nAccount Number: 999 999 999 999 999\n\n4. CB Bank\nAccount Name: Your Shop Name\nAccount Number: 000 000 000 000 000\n\nမှတ်ချက်။ ငွေလွှဲပြီးပါက ငွေလွှဲပြေစာ (Screenshot) သို့မဟုတ် ငွေလွှဲ Transaction နံပါတ်ကို ပေးပို့ပေးပါခင်ဗျာ။';
  if (bankDoc) {
    return bankDoc.content + `\n\n${prompt}`;
  }
  return prompt;
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

async function processStateAdvancement(
  bot: any,
  token: string,
  senderId: string,
  session: any,
  text: string
) {
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
        title: `${z.township} (${z.fee.toLocaleString()} Ks)`.substring(0, 20),
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
      { title: 'COD စနစ်', payload: 'PAY_COD' },
      { title: 'KPay / Bank', payload: 'PAY_BANK' },
    ]);
    return;
  }

  if (session.state === 'collecting_payment_method') {
    if (text.trim().toLowerCase().includes('cod')) {
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
    } else {
      await updateSession(session.id, {
        state: 'collecting_payment_screenshot',
        pendingData: {
          ...((session.pendingData as any) || {}),
          paymentMethod: 'Bank Transfer/KPay',
        },
      });
      await sendMessengerMessage(token, senderId, getBankInfoMessage(bot));
    }
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
}

// ─── Handle text messages ───
// ─── Handle incoming text messages ───
async function handleIncomingText(bot: any, token: string, senderId: string, text: string) {
  const session = await getSession(bot.id, senderId);
  const lowerText = text.trim().toLowerCase();

  // 1. If user is in a state where we are collecting info (e.g. checkout), process it
  if (session.state !== 'browsing') {
    // Handling "cancel" even during checkout flows is good UX
    if (lowerText === 'cancel' || lowerText === 'ပယ်ဖျက်') {
      await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
      await sendMessengerMessage(token, senderId, '❌ ပယ်ဖျက်လိုက်ပါပြီ။ ဘာကူညီပေးရမလဲ?');
      return;
    }
    await processStateAdvancement(bot, token, senderId, session, text);
    return;
  }

  // 2. Fallback: Any typed text in browsing mode shows the welcome message
  const welcomeMsg =
    bot.messengerWelcomeMessage ??
    '🙏 မင်္ဂလာပါ! ကျွန်တော်တို့ ဆိုင်မှ ကြိုဆိုပါတယ်။\n\nMenu မှ ရွေးချယ်၍ ကြည့်ရှုနိုင်ပါတယ် 😊';
  await sendMessengerMessage(token, senderId, welcomeMsg);
}

// ─── postback / quick reply ───
async function handlePostback(bot: any, token: string, senderId: string, payload: string) {
  const session = await getSession(bot.id, senderId);

  // ── Get Started (new user greeting) ──
  if (payload === 'GET_STARTED') {
    const welcomeMsg =
      bot.messengerWelcomeMessage ??
      '🎉 မင်္ဂလာပါ! ကျွန်တော်တို့ဆိုင်မှ ကြိုဆိုပါတယ် 😊\n\nအောက်ပါ menu မှ ရွေးချယ်နိုင်ပါတယ်:\n📦 View Products - ပစ္စည်းများ ကြည့်ရှုရန်\n🧾 Check My Orders - မှာထားသော Order စစ်ရန်\n📞 Contact Us - ဆက်သွယ်ရန်\n\nဘာကူညီပေးရမလဲ? 😊';
    await sendMessengerMessage(token, senderId, welcomeMsg);
    return;
  }

  // ── Persistent Menu ──
  if (payload === 'MENU_VIEW_PRODUCTS') {
    const products = await prisma.product.findMany({
      where: { botId: bot.id, isActive: true },
    });
    if (products.length > 0) {
      const elements = products.slice(0, 10).map((p: any) => ({
        title: p.name,
        subtitle: `${p.price.toLocaleString()} Ks | ${p.category}${p.stockCount > 0 ? '' : ' (Out of stock)'}`,
        image_url: p.image || 'https://placehold.co/600x600/f4f4f5/a1a1aa?text=No+Image',
        buttons: [
          { type: 'postback', title: '🛒 Add to Cart', payload: `ORDER_${p.id}` },
          { type: 'postback', title: 'View Detail', payload: `DETAIL_${p.id}` },
        ],
      }));
      await sendMessengerGenericTemplate(token, senderId, elements);
    } else {
      await sendMessengerMessage(token, senderId, '🙏 လောလောဆယ် ပစ္စည်းများ မရှိသေးပါ။');
    }
    return;
  }

  if (payload === 'MENU_CHECK_ORDERS') {
    const orders = await prisma.order.findMany({
      where: { botId: bot.id, messengerSenderId: senderId, status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    if (orders.length === 0) {
      await sendMessengerMessage(token, senderId, '📦 သင်မှာယူထားသော Order များ မရှိသေးပါ။');
    } else {
      let msg = '📦 သင်၏ နောက်ဆုံးမှာယူထားသော Orders များ:\n\n';
      orders.forEach((o: any) => {
        msg += `🧾 Order: #${o.id.slice(-6).toUpperCase()}\n`;
        const dateObj = new Date(o.createdAt);
        msg += `📅 Date: ${dateObj.toLocaleDateString('en-GB')}\n`;
        msg += `🚚 Status: ${o.status}\n`;
        msg += `💰 Total: ${o.total.toLocaleString()} Ks\n\n`;
      });
      await sendMessengerMessage(token, senderId, msg);
    }
    return;
  }

  if (payload === 'MENU_CONTACT_US') {
    const defaultContactMsg =
      '📞 အသေးစိတ်သိရှိလိုပါက Page Chat မှတဆင့်ဖြစ်စေ၊ 09876543210 ကို ဖုန်းဆက်၍ဖြစ်စေ ဆက်သွယ်မေးမြန်းနိုင်ပါတယ်။ 😊';
    await sendMessengerMessage(token, senderId, bot.messengerContactMessage ?? defaultContactMsg);
    return;
  }

  if (payload === 'CONFIRM_ORDER') {
    // CONFIRM_ORDER now kicks off CHECKOUT_NOW flow
    const cart: any[] = (session.cart as any[]) || [];
    if (cart.length === 0) {
      await sendMessengerMessage(token, senderId, '🛒 Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ။');
      return;
    }
    const subtotal = cart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
    await updateSession(session.id, { state: 'collecting_name', pendingData: { subtotal } });
    let summary = '🎉 Order အတည်ပြုပြီးပါပြီ!\n\n📋 Order Summary:\n';
    cart.forEach((item: any) => {
      summary += `• ${item.name} x${item.qty} = ${(item.price * item.qty).toLocaleString()} Ks\n`;
    });
    summary += `\n💰 ${subtotal.toLocaleString()} Ks\n\n📝 Delivery အတွက် အချက်အလက်တွေ လိုပါမယ်\n\n👤 အမည် ထည့်ပေးပါ`;
    await sendMessengerMessage(token, senderId, summary);
    return;
  }

  if (payload === 'SHOW_ALL_PRODUCTS') {
    const products = await prisma.product.findMany({
      where: { botId: bot.id, isActive: true },
    });
    if (products.length > 0) {
      const elements = products.slice(0, 10).map((p: any) => ({
        title: p.name,
        subtitle: `${p.price.toLocaleString()} Ks | ${p.category}${p.stockCount > 0 ? '' : ' (Out of stock)'}`,
        image_url: p.image || 'https://placehold.co/600x600/f4f4f5/a1a1aa?text=No+Image',
        buttons: [
          { type: 'postback', title: '🛒 Add to Cart', payload: `ORDER_${p.id}` },
          { type: 'postback', title: 'View Detail', payload: `DETAIL_${p.id}` },
        ],
      }));
      await sendMessengerGenericTemplate(token, senderId, elements);
    } else {
      await sendMessengerMessage(token, senderId, '🙏 လောလောဆယ် ပစ္စည်းများ မရှိသေးပါ။');
    }
    return;
  }

  // ── View Cart ──
  if (payload === 'VIEW_CART') {
    const cart: any[] = (session.cart as any[]) || [];
    if (cart.length === 0) {
      await sendMessengerQuickReplies(
        token,
        senderId,
        '🛒 Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ။ ပစ္စည်းများ ကြည့်ရှုရန် →',
        [{ title: '📦 ကြည့်ရှုမည်', payload: 'SHOW_ALL_PRODUCTS' }]
      );
      return;
    }
    const total = cart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
    let msg = '🛒 သင့် Cart:\n\n';
    cart.forEach((item: any) => {
      msg += `• ${item.name} x${item.qty}  →  ${(item.price * item.qty).toLocaleString()} Ks\n`;
    });
    msg += `\n💰 စုစုပေါင်း: ${total.toLocaleString()} Ks`;
    await sendMessengerQuickReplies(token, senderId, msg, [
      { title: '💳 Checkout', payload: 'CHECKOUT_NOW' },
      { title: '🛍️ ဆက်ဝယ်မည်', payload: 'SHOW_ALL_PRODUCTS' },
      { title: '🗑️ Cart ဖျက်မည်', payload: 'CLEAR_CART' },
    ]);
    return;
  }

  // ── Clear Cart ──
  if (payload === 'CLEAR_CART') {
    await updateSession(session.id, { cart: null, pendingData: null, state: 'browsing' });
    await sendMessengerQuickReplies(token, senderId, '🗑️ Cart ကို ဖျက်လိုက်ပါပြီ။', [
      { title: '📦 ပစ္စည်းကြည့်မည်', payload: 'SHOW_ALL_PRODUCTS' },
    ]);
    return;
  }

  // ── Checkout Now ──
  if (payload === 'CHECKOUT_NOW') {
    const cart: any[] = (session.cart as any[]) || [];
    if (cart.length === 0) {
      await sendMessengerMessage(
        token,
        senderId,
        '🛒 Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ။ ဦးစွာ ပစ္စည်းရွေးပေးပါ။'
      );
      return;
    }
    const subtotal = cart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
    await updateSession(session.id, { state: 'collecting_name', pendingData: { subtotal } });
    let summary = '📋 Order Summary:\n';
    cart.forEach((item: any) => {
      summary += `• ${item.name} x${item.qty} = ${(item.price * item.qty).toLocaleString()} Ks\n`;
    });
    summary += `\n💰 ${subtotal.toLocaleString()} Ks\n\n📝 Delivery အတွက် အချက်အလက်တွေ လိုပါမည်\n\n👤 အမည် ထည့်ပေးပါ`;
    await sendMessengerMessage(token, senderId, summary);
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
          { title: 'COD စနစ်', payload: 'PAY_COD' },
          { title: 'KPay / Bank', payload: 'PAY_BANK' },
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
    await sendMessengerMessage(token, senderId, getBankInfoMessage(bot));
    return;
  }

  // ── Add to Cart (ORDER_xxx) ──
  if (payload.startsWith('ORDER_')) {
    const productId = payload.replace('ORDER_', '');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.stockCount <= 0) {
      if (product)
        await sendMessengerMessage(
          token,
          senderId,
          `⚠️ စိတ်မရှိပါနဲ့ခင်ဗျာ! ${product.name} သည် လက်ကျန် မရှိတော့ပါ။`
        );
      return;
    }

    // Accumulate in cart and check stock again including what's already in cart
    const currentCart: any[] = (session.cart as any[]) || [];
    const existingIdx = currentCart.findIndex((i: any) => i.productId === product.id);
    const existingInCart = existingIdx >= 0 ? currentCart[existingIdx].qty : 0;
    const requestedQty = 1;

    if (existingInCart + requestedQty > product.stockCount) {
      const errorMsg = `⚠️ စိတ်မရှိပါနဲ့ခင်ဗျာ! ${product.name} က လက်ကျန် ${product.stockCount} ခုပဲ ရှိပါတော့တယ်။\n\nသင်၏ Cart ထဲတွင် ${existingInCart} ခု ရှိပြီးသား ဖြစ်ပါတယ်။`;
      const totalItems = currentCart.reduce((s: number, i: any) => s + i.qty, 0);
      await sendMessengerQuickReplies(token, senderId, errorMsg, [
        { title: '🛍️ ဆက်ဝယ်မည်', payload: 'SHOW_ALL_PRODUCTS' },
        { title: `🛒 Cart (${totalItems})`, payload: 'VIEW_CART' },
        { title: '💳 Checkout', payload: 'CHECKOUT_NOW' },
      ]);
      return;
    }

    const newCart =
      existingIdx >= 0
        ? currentCart.map((item: any, idx: number) =>
            idx === existingIdx ? { ...item, qty: item.qty + requestedQty } : item
          )
        : [
            ...currentCart,
            { productId: product.id, name: product.name, price: product.price, qty: requestedQty },
          ];

    const subtotal = newCart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
    await updateSession(session.id, { cart: newCart, pendingData: { subtotal } });

    const totalItems = newCart.reduce((s: number, i: any) => s + i.qty, 0);
    const addedMsg = `✅ ${product.name} ကို Cart ထည့်လိုက်ပါပြီ!\n🛒 Cart: ${totalItems} မျိုး | ${subtotal.toLocaleString()} Ks`;
    await sendMessengerQuickReplies(token, senderId, addedMsg, [
      { title: '🛍️ ဆက်ဝယ်မည်', payload: 'SHOW_ALL_PRODUCTS' },
      { title: `🛒 Cart (${totalItems})`, payload: 'VIEW_CART' },
      { title: '💳 Checkout', payload: 'CHECKOUT_NOW' },
    ]);
    return;
  }

  // ── Product Detail ──
  if (payload.startsWith('DETAIL_')) {
    const productId = payload.replace('DETAIL_', '');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (product) {
      const msg = `📦 ${product.name}\n🔖 Category: ${product.category}\n💰 Price: ${product.price.toLocaleString()} Ks${product.description ? `\n\n📝 ${product.description}` : ''}\n${product.stockCount > 0 ? `✅ Stock: ${product.stockCount} ရှိသည်` : '❌ Out of Stock'}`;
      await sendMessengerQuickReplies(token, senderId, msg, [
        { title: '🛒 Cart ထည့်မည်', payload: `ORDER_${product.id}` },
        { title: '📦 နောက်ထပ်ကြည့်မည်', payload: 'SHOW_ALL_PRODUCTS' },
      ]);
    }
    return;
  }

  await handleIncomingText(bot, token, senderId, payload);
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
