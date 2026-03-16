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
        } else if (event.message?.text) {
          if (bot.messengerMode === 'rule_based') {
            await handleRuleBasedMessage(bot, token, senderId, event.message.text);
          } else {
            await handleTextMessage(bot, token, senderId, event.message.text);
          }
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
  const docs = bot.documents || [];
  const bankDoc = docs.find(
    (d: any) =>
      d.title.toLowerCase().includes('bank') ||
      d.title.toLowerCase().includes('payment') ||
      d.title.toLowerCase().includes('pay')
  );
  const prompt =
    '🏦 Bank Transfer သို့မဟုတ် K Pay ဖြင့် ငွေလွှဲထားသော Screenshot သို့မဟုတ် Transaction အချက်အလက်များကို ပေးပို့ပေးပါခင်ဗျာ။';
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
async function handleTextMessage(bot: any, token: string, senderId: string, text: string) {
  const session = await getSession(bot.id, senderId);
  const lowerText = text.trim().toLowerCase();

  // ── Cancel ──
  if (lowerText === 'cancel' || lowerText === 'ပယ်ဖျက်') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendMessengerMessage(token, senderId, '❌ ပယ်ဖျက်လိုက်ပါပြီ။ ဘာကူညီပေးရမလဲ?');
    return;
  }

  // ── Menu / Static Commands ──
  if (
    lowerText === 'check my orders' ||
    lowerText === 'မှာထားတာတွေစစ်ချင်တယ်' ||
    lowerText === 'check_orders'
  ) {
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

  if (lowerText === 'အစသို့' || lowerText === 'home') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendMessengerMessage(
      token,
      senderId,
      '🏠 ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။ ဘာကူညီပေးရမလဲ? 😊'
    );
    return;
  }

  if (lowerText === 'online payment' || lowerText === 'online_payment') {
    await sendMessengerMessage(token, senderId, getBankInfoMessage(bot));
    return;
  }

  if (lowerText === 'ဆက်သွယ်ရန်' || lowerText === 'contact_us') {
    await sendMessengerMessage(
      token,
      senderId,
      '📞 အသေးစိတ်သိရှိလိုပါက Page Chat မှတဆင့်ဖြစ်စေ၊ 09876543210 ကို ဖုန်းဆက်၍ဖြစ်စေ ဆက်သွယ်မေးမြန်းနိုင်ပါတယ်။ 😊'
    );
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

  let systemContext = `${productContext}${deliveryContext}${cartContext}

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

  const isCollecting = session.state.startsWith('collecting_');
  if (isCollecting) {
    let askingFor = '';
    switch (session.state) {
      case 'collecting_name':
        askingFor = 'Customer Name';
        break;
      case 'collecting_phone':
        askingFor = 'Phone Number';
        break;
      case 'collecting_address':
        askingFor = 'Delivery Address';
        break;
      case 'collecting_township':
        askingFor = 'Township name or selection';
        break;
      case 'collecting_payment_method':
        askingFor = 'Payment Method (COD or Bank Transfer)';
        break;
      case 'collecting_payment_screenshot':
        askingFor = 'Screenshot of payment or Transaction info text';
        break;
    }
    systemContext += `\n\n[CRITICAL STATE] The system is currently waiting for the user to provide their: ${askingFor}.
If the user's message directly provides this information (e.g. they typed a valid name, phone number, address, township, payment choice, or transaction text/ok), you MUST output exactly: [VALID_ANSWER]
HOWEVER, if the user is asking a question or requesting info (e.g. asking for bank account numbers, asking product details, or chatting), DO NOT output [VALID_ANSWER]. Instead, answer their question comprehensively using the provided catalog and knowledge base.`;
  }

  const aiResponse = await generateBotResponse(bot.id, text + '\n\n' + systemContext, [], 'web');

  const cleanMsg = aiResponse
    .replace(/\[ORDER:.+?\]/g, '')
    .replace(/\[SHOW_PRODUCTS\]/g, '')
    .replace(/\[VALID_ANSWER\]/g, '')
    .trim();

  // Route valid answers back to state machine text processing
  if (isCollecting && aiResponse.includes('[VALID_ANSWER]')) {
    await processStateAdvancement(bot, token, senderId, session, text);
    return;
  }

  // Answer Questions during Order flow without losing state
  if (isCollecting && !aiResponse.includes('[VALID_ANSWER]')) {
    if (cleanMsg) {
      await sendMessengerMessage(token, senderId, cleanMsg);
    }

    // Send a polite reminder of what we were asking for
    let reminder = '';
    switch (session.state) {
      case 'collecting_name':
        reminder =
          'ဆက်လက်လုပ်ဆောင်ရန် အမည် ထည့်ပေးပါခင်ဗျာ (သို့) ပယ်ဖျက်မည်ဆိုပါက cancel ဟုရိုက်ပါ။';
        break;
      case 'collecting_phone':
        reminder = 'ဆက်လက်လုပ်ဆောင်ရန် ဖုန်းနံပါတ် ထည့်ပေးပါခင်ဗျာ။';
        break;
      case 'collecting_address':
        reminder = 'ဆက်လက်လုပ်ဆောင်ရန် လိပ်စာ ထည့်ပေးပါခင်ဗျာ။';
        break;
      case 'collecting_township':
        reminder = 'ဆက်လက်လုပ်ဆောင်ရန် မြို့နယ် ရိုက်ထည့်ပေးပါခင်ဗျာ။';
        break;
      case 'collecting_payment_method':
        reminder =
          'ဆက်လက်လုပ်ဆောင်ရန် COD သို့မဟုတ် Bank Transfer ဖြင့် ငွေချေမည်ကို ရွေးပေးပါ/ရေးပေးပါ။';
        break;
      case 'collecting_payment_screenshot':
        reminder =
          'ငွေလွှဲပြီးပါက Transaction Screenshot သို့မဟုတ် အချက်အလက်များကို ပေးပို့ပေးပါခင်ဗျာ။';
        break;
    }
    if (reminder) {
      await sendMessengerMessage(token, senderId, reminder);
    }
    return;
  }

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
      const cartCount = ((session.cart as any[]) || []).reduce((s: number, i: any) => s + i.qty, 0);
      const elements = products.slice(0, 10).map((p: any) => ({
        title: p.name,
        subtitle: `${p.price.toLocaleString()} Ks | ${p.category}${p.stockCount > 0 ? '' : ' (Out of stock)'}`,
        image_url: p.image || 'https://placehold.co/600x600/f4f4f5/a1a1aa?text=No+Image',
        buttons: [
          { type: 'postback', title: '🛒 Add to Cart', payload: `ORDER_${p.id}` },
          { type: 'postback', title: 'View Detail', payload: `DETAIL_${p.id}` },
          ...(cartCount > 0 ? [{ type: 'postback', title: `🧾 Cart (${cartCount})`, payload: 'VIEW_CART' }] : []),
        ],
      }));
      await sendMessengerGenericTemplate(token, senderId, elements);
    } else {
      await sendMessengerMessage(token, senderId, '🙏 လောလောဆယ် ပစ္စည်းများ မရှိသေးပါ။');
    }
    return;
  }

  // ── AI order trigger → add to cart ──
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
      const currentCart: any[] = (session.cart as any[]) || [];
      const existingIdx = currentCart.findIndex((i: any) => i.productId === product.id);
      const newCart =
        existingIdx >= 0
          ? currentCart.map((item: any, idx: number) =>
              idx === existingIdx ? { ...item, qty: item.qty + qty } : item
            )
          : [
              ...currentCart,
              { productId: product.id, name: product.name, price: product.price, qty },
            ];

      const subtotal = newCart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
      await updateSession(session.id, { cart: newCart, pendingData: { subtotal } });

      const totalItems = newCart.reduce((s: number, i: any) => s + i.qty, 0);
      const addMsg = `${cleanMsg ? cleanMsg + '\n\n' : ''}✅ ${product.name} x${qty} ကို Cart ထည့်လိုက်ပါပြီ!\n🛒 Cart: ${totalItems} မျိုး | ${subtotal.toLocaleString()} Ks`;
      await sendMessengerQuickReplies(token, senderId, addMsg, [
        { title: '🛍️ ဆက်ဝယ်မည်', payload: 'SHOW_ALL_PRODUCTS' },
        { title: `🛒 Cart (${totalItems})`, payload: 'VIEW_CART' },
        { title: '💳 Checkout', payload: 'CHECKOUT_NOW' },
      ]);
    } else if (product && product.stockCount < qty) {
      await sendMessengerMessage(
        token,
        senderId,
        `${cleanMsg ? cleanMsg + '\n\n' : ''}⚠️ ${product.name} - လက်ကျန် ${product.stockCount} ခုပဲ ရှိတော့ပါတယ်။`
      );
    }
    return;
  }
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
      const cartCount = ((session.cart as any[]) || []).reduce((s: number, i: any) => s + i.qty, 0);
      const elements = products.slice(0, 10).map((p: any) => ({
        title: p.name,
        subtitle: `${p.price.toLocaleString()} Ks | ${p.category}${p.stockCount > 0 ? '' : ' (Out of stock)'}`,
        image_url: p.image || 'https://placehold.co/600x600/f4f4f5/a1a1aa?text=No+Image',
        buttons: [
          { type: 'postback', title: '🛒 Add to Cart', payload: `ORDER_${p.id}` },
          { type: 'postback', title: 'View Detail', payload: `DETAIL_${p.id}` },
          ...(cartCount > 0 ? [{ type: 'postback', title: `🧾 Cart (${cartCount})`, payload: 'VIEW_CART' }] : []),
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
    await sendMessengerMessage(
      token,
      senderId,
      '📞 အသေးစိတ်သိရှိလိုပါက Page Chat မှတဆင့်ဖြစ်စေ၊ 09876543210 ကို ဖုန်းဆက်၍ဖြစ်စေ ဆက်သွယ်မေးမြန်းနိုင်ပါတယ်။ 😊'
    );
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
      const cartCount = ((session.cart as any[]) || []).reduce((s: number, i: any) => s + i.qty, 0);
      const elements = products.slice(0, 10).map((p: any) => ({
        title: p.name,
        subtitle: `${p.price.toLocaleString()} Ks | ${p.category}${p.stockCount > 0 ? '' : ' (Out of stock)'}`,
        image_url: p.image || 'https://placehold.co/600x600/f4f4f5/a1a1aa?text=No+Image',
        buttons: [
          { type: 'postback', title: '🛒 Add to Cart', payload: `ORDER_${p.id}` },
          { type: 'postback', title: 'View Detail', payload: `DETAIL_${p.id}` },
          ...(cartCount > 0 ? [{ type: 'postback', title: `🧾 Cart (${cartCount})`, payload: 'VIEW_CART' }] : []),
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
        token, senderId,
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
    await sendMessengerQuickReplies(
      token, senderId,
      '🗑️ Cart ကို ဖျက်လိုက်ပါပြီ။',
      [{ title: '📦 ပစ္စည်းကြည့်မည်', payload: 'SHOW_ALL_PRODUCTS' }]
    );
    return;
  }

  // ── Checkout Now ──
  if (payload === 'CHECKOUT_NOW') {
    const cart: any[] = (session.cart as any[]) || [];
    if (cart.length === 0) {
      await sendMessengerMessage(token, senderId, '🛒 Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ။ ဦးစွာ ပစ္စည်းရွေးပေးပါ။');
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
      if (product) await sendMessengerMessage(token, senderId, `⚠️ ${product.name} သည် လက်ကျန် မရှိတော့ပါ။`);
      return;
    }

    // Accumulate in cart
    const currentCart: any[] = (session.cart as any[]) || [];
    const existingIdx = currentCart.findIndex((i: any) => i.productId === product.id);
    const newCart =
      existingIdx >= 0
        ? currentCart.map((item: any, idx: number) =>
            idx === existingIdx ? { ...item, qty: item.qty + 1 } : item
          )
        : [...currentCart, { productId: product.id, name: product.name, price: product.price, qty: 1 }];

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

// ─── Rule-Based message handler (no AI) ───
async function handleRuleBasedMessage(bot: any, token: string, senderId: string, text: string) {
  const session = await getSession(bot.id, senderId);
  const lowerText = text.trim().toLowerCase();

  // ── 1. Cancel always resets the flow ──
  if (lowerText === 'cancel' || lowerText === 'ပယ်ဖျက်') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendMessengerMessage(token, senderId, '❌ ပယ်ဖျက်လိုက်ပါပြီ။ ဘာကူညီပေးရမလဲ?');
    return;
  }

  // ── 2. If mid-order-flow, pass input to state machine (same as AI mode) ──
  const isCollecting = session.state.startsWith('collecting_');
  const isConfirming = session.state === 'confirming';

  if (isCollecting) {
    await processStateAdvancement(bot, token, senderId, session, text);
    return;
  }

  // ── 3. Confirming state — handle yes/no ──
  if (isConfirming) {
    // Let postback handler deal with CONFIRM/CANCEL payloads
    // But if user types text during confirming, remind them to use the buttons
    await sendMessengerMessage(
      token,
      senderId,
      '⬆️ အပေါ်က ✅ အတည်ပြု သို့မဟုတ် ❌ ပယ်ဖျက် ကိုနှိပ်ပေးပါ။'
    );
    return;
  }

  // ── 4. In browsing state — match keyword rules ──
  const rules: any[] = bot.messengerAutoReplies || [];
  for (const rule of rules) {
    if (lowerText.includes(rule.keyword.toLowerCase())) {
      await sendMessengerMessage(token, senderId, rule.reply);
      return;
    }
  }

  const welcomeMsg =
    bot.messengerWelcomeMessage ??
    '🙏 မင်္ဂလာပါ! ကျွန်တော်တို့ ဆိုင်မှ ကြိုဆိုပါတယ်။\n\nMenu မှ ရွေးချယ်၍ ကြည့်ရှုနိုင်ပါတယ် 😊';
  await sendMessengerMessage(token, senderId, welcomeMsg);
}
