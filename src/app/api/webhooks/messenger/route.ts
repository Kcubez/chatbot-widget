import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  sendMessengerMessage,
  sendMessengerTyping,
  sendMessengerQuickReplies,
  sendMessengerGenericTemplate,
} from '@/lib/messenger';
import { generateBotResponse, verifyPaymentScreenshot } from '@/lib/ai';
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
    const attachment = attachments[0];
    if (attachment.type !== 'image') {
      await sendMessengerMessage(
        token,
        senderId,
        '⚠️ ကျေးဇူးပြု၍ ငွေလွှဲ screenshot ပုံကိုသာ ပို့ပေးပါခင်ဗျာ။'
      );
      return;
    }

    const imageUrl = attachment.payload.url;
    const pending = (session.pendingData as any) || {};
    const subtotal = pending.subtotal || 0;
    const deliveryFee = pending.deliveryFee || 0;
    const expectedAmount = subtotal + deliveryFee;

    // Show typing status while AI analyzes the image
    await sendMessengerTyping(token, senderId, 'typing_on');

    try {
      const result = await verifyPaymentScreenshot(imageUrl, expectedAmount, bot.id);

      if (result.passed) {
        await finishOrder(
          bot,
          token,
          senderId,
          session,
          pending.township || 'Unknown',
          deliveryFee,
          'Bank Transfer/KPay'
        );
      } else {
        await sendMessengerMessage(token, senderId, result.feedback);
      }
    } catch (err) {
      console.error('Payment verification failed:', err);
      // Fallback: if AI fails, proceed manually? Or ask to resend?
      await sendMessengerMessage(
        token,
        senderId,
        '⚠️ စစ်ဆေးရာမှာ အမှားတစ်ခု ဖြစ်သွားပါတယ်။ တစ်ချက်ပြန်ပို့ပေးပါဦး။'
      );
    } finally {
      await sendMessengerTyping(token, senderId, 'typing_off');
    }
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
    const nameText = text.trim();
    // Validate name: Must contain at least one English or Myanmar letter
    const isValidName = /[a-zA-Z\u1000-\u109F]/.test(nameText);

    if (!isValidName || nameText.length < 2) {
      await sendMessengerMessage(
        token,
        senderId,
        '⚠️ ကျေးဇူးပြု၍ အမည်မှန်ကန်စွာ (အက္ခရာများပါဝင်သော) ပြန်လည်ရေးသွင်းပေးပါခင်ဗျာ'
      );
      return;
    }

    await updateSession(session.id, {
      state: 'collecting_phone',
      pendingData: { ...((session.pendingData as any) || {}), customerName: nameText },
    });
    await sendMessengerMessage(token, senderId, `✅ အမည်: ${nameText}\n\n📱 ဖုန်းနံပါတ် ထည့်ပေးပါ`);
    return;
  }

  if (session.state === 'collecting_phone') {
    const phoneText = text.trim();
    // Basic regex: checks if there are at least 7 digits (allowing for +, -, spaces, and parentheses)
    const phoneRegex = /^(?=(?:\D*\d){7,})[\d\s\+\-\(\)]+$/;

    if (!phoneRegex.test(phoneText)) {
      await sendMessengerMessage(
        token,
        senderId,
        '⚠️ ကျေးဇူးပြု၍ ဖုန်းနံပါတ်အမှန်ကို (ဂဏန်းများဖြင့်) သေချာစွာ ပြန်လည်ရိုက်ထည့်ပေးပါခင်ဗျာ 👇'
      );
      return;
    }

    const pendingData = { ...((session.pendingData as any) || {}), customerPhone: phoneText };

    const requireAddress = session.pendingData?.requireAddress;

    if (bot.botType !== 'ecommerce' && !!bot.botType && !requireAddress) {
      // Service bot -> skip address, township, and go to payment screenshot (if price > 0)
      const subtotalAmt = pendingData.subtotal || 0;

      if (subtotalAmt === 0) {
        await finishOrder(bot, token, senderId, { ...session, pendingData }, 'N/A', 0, 'N/A');
        return;
      }

      await updateSession(session.id, {
        state: 'collecting_payment_screenshot',
        pendingData: {
          ...pendingData,
          township: 'N/A',
          deliveryFee: 0,
          paymentMethod: 'Bank Transfer/KPay',
        },
      });
      const subtotalMsg = `✅ အချက်အလက်များ ပြည့်စုံပါပြီ။\n💰 ကျသင့်ငွေ စုစုပေါင်း: ${subtotalAmt.toLocaleString()} Ks\n\n`;
      await sendMessengerMessage(token, senderId, subtotalMsg + getBankInfoMessage(bot));
      return;
    }

    await updateSession(session.id, {
      state: 'collecting_address',
      pendingData,
    });

    // For services requiring address, ask for address/township combo.
    const addressPrompt =
      bot.botType !== 'ecommerce' && !!bot.botType
        ? `✅ ဖုန်း: ${phoneText}\n\n🏠 လိပ်စာ (သို့) မြို့နယ် ထည့်ပေးပါ (မလိုအပ်ပါက '-' ဟုသာ ရိုက်ထည့်၍ ကျော်သွားနိုင်သည်)`
        : `✅ ဖုန်း: ${phoneText}\n\n🏠 လိပ်စာ ထည့်ပေးပါ (ရပ်ကွက်/လမ်း/အိမ်အမှတ်)`;

    await sendMessengerMessage(token, senderId, addressPrompt);
    return;
  }

  if (session.state === 'collecting_address') {
    const addressDetails = text.trim();
    const pendingData = {
      ...((session.pendingData as any) || {}),
      customerAddress: addressDetails,
    };

    if (bot.botType !== 'ecommerce' && !!bot.botType) {
      // Service bot just collected the combined address line, go to payment screenshot (if price > 0)
      const subtotalAmt = pendingData.subtotal || 0;

      if (subtotalAmt === 0) {
        await finishOrder(bot, token, senderId, { ...session, pendingData }, 'N/A', 0, 'N/A');
        return;
      }

      await updateSession(session.id, {
        state: 'collecting_payment_screenshot',
        pendingData: {
          ...pendingData,
          township: 'N/A',
          deliveryFee: 0,
          paymentMethod: 'Bank Transfer/KPay',
        },
      });
      const subtotalMsg = `✅ အချက်အလက်များ ပြည့်စုံပါပြီ။\n💰 ကျသင့်ငွေ စုစုပေါင်း: ${subtotalAmt.toLocaleString()} Ks\n\n`;
      await sendMessengerMessage(token, senderId, subtotalMsg + getBankInfoMessage(bot));
      return;
    }

    await updateSession(session.id, {
      state: 'collecting_township',
      pendingData,
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
    const zones = await prisma.deliveryZone.findMany({
      where: { botId: bot.id, isActive: true },
      orderBy: { township: 'asc' },
    });

    if (zones.length > 0) {
      // The shop has configured delivery zones; typing is forbidden
      const quickReplies = zones.slice(0, 13).map((z: any) => ({
        title:
          bot.botType === 'ecommerce' || !bot.botType
            ? `${z.township} (${z.fee.toLocaleString()} Ks)`.substring(0, 20)
            : `${z.township}`.substring(0, 20),
        payload: `TOWNSHIP_${z.id}`,
      }));
      await sendMessengerQuickReplies(
        token,
        senderId,
        '⚠️ ကျေးဇူးပြု၍ စာရိုက်မည့်အစား အောက်ပါ မြို့နယ်ခလုတ်များမှသာ ရွေးချယ်ပေးပါခင်ဗျာ 👇',
        quickReplies
      );
      return;
    }

    // If no zones are configured, accept whatever they typed and charge 0 delivery fee
    const typedTownship = text.trim();
    const pendingData = {
      ...((session.pendingData as any) || {}),
      township: typedTownship,
      deliveryFee: 0,
    };

    if (bot.botType !== 'ecommerce' && !!bot.botType) {
      // For Service/Info bots: Skip payment selection and finish order directly.
      await finishOrder(bot, token, senderId, session, typedTownship, 0, 'N/A');
      return;
    }

    await updateSession(session.id, {
      state: 'collecting_payment_method',
      pendingData,
    });

    await sendMessengerQuickReplies(
      token,
      senderId,
      `✅ မြို့နယ်: ${typedTownship}\n\n💳 ငွေပေးချေမှုကို မည်သို့ပြုလုပ်မည်နည်း?`,
      [
        { title: 'COD စနစ်', payload: 'PAY_COD' },
        { title: 'KPay / Bank', payload: 'PAY_BANK' },
      ]
    );
    return;
  }

  if (session.state === 'collecting_payment_method') {
    const lowerText = text.trim().toLowerCase();

    // Check if the user typed something related to COD or KPay
    const matchesCOD =
      lowerText === 'cod' ||
      lowerText.includes('cash on delivery') ||
      lowerText.includes('လက်ငင်း');
    const matchesBank =
      lowerText.includes('kpay') ||
      lowerText.includes('bank') ||
      lowerText.includes('transfer') ||
      lowerText.includes('လွှဲ');

    if (matchesCOD) {
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
    } else if (matchesBank) {
      await updateSession(session.id, {
        state: 'collecting_payment_screenshot',
        pendingData: {
          ...((session.pendingData as any) || {}),
          paymentMethod: 'Bank Transfer/KPay',
        },
      });
      await sendMessengerMessage(token, senderId, getBankInfoMessage(bot));
    } else {
      // If none matches, ask again
      await sendMessengerQuickReplies(
        token,
        senderId,
        '⚠️ ကျေးဇူးပြု၍ ငွေပေးချေမှုစနစ်ကို အောက်ပါခလုတ်များမှ မှန်ကန်စွာ ရွေးချယ်ပေးပါခင်ဗျာ 👇',
        [
          { title: 'COD စနစ်', payload: 'PAY_COD' },
          { title: 'KPay / Bank', payload: 'PAY_BANK' },
        ]
      );
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

  const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
  const isService = bot.botType === 'service';
  const isAppointment = bot.botType === 'appointment';

  const welcomeMsg =
    bot.messengerWelcomeMessage ??
    (isEcommerce
      ? '🙏 မင်္ဂလာပါ! ကျွန်တော်တို့ ဆိုင်မှ ကြိုဆိုပါတယ်။\n\nMenu မှ ရွေးချယ်၍ ကြည့်ရှုနိုင်ပါတယ် 😊'
      : isAppointment
        ? '🙏 မင်္ဂလာပါ! ရက်ချိန်းယူရန်အတွက် "ရက်ချိန်းယူမည်" ကို နှိပ်နိုင်ပါတယ် 😊'
        : '🙏 မင်္ဂလာပါ! ကျွန်တော်တို့ ဆိုင်မှ ကြိုဆိုပါတယ်။\n\nဘာကူညီပေးရမလဲ? 😊');

  const quickReplies: { title: string; payload: string }[] = [];
  if (isEcommerce) {
    quickReplies.push({ title: '📦 ပစ္စည်းများ', payload: 'SHOW_ALL_PRODUCTS' });
    quickReplies.push({ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' });
  } else if (isService) {
    quickReplies.push({ title: '🛠️ ဝန်ဆောင်မှုများ', payload: 'MENU_VIEW_SERVICES' });
    quickReplies.push({ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' });
  } else if (isAppointment) {
    // If appointment bot, we can use a card template instead of quick replies to allow webview button
    // But for simple fallback, show these:
    quickReplies.push({ title: '🏥 ဌာနများ', payload: 'MENU_VIEW_SERVICES' });
    quickReplies.push({ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' });
    quickReplies.push({ title: '🧾 ရက်ချိန်းစစ်ရန်', payload: 'MENU_CHECK_ORDERS' });
  }

  if (isAppointment) {
    // Specialized card for appointment bot with WebView calendar button
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chatbot.local';
    const calendarUrl = `${appUrl}/webview/calendar/${bot.id}?psid=${senderId}`;
    await sendMessengerGenericTemplate(token, senderId, [
      {
        title: '🏥 ရက်ချိန်းယူရန်',
        subtitle: 'အောက်ပါ ခလုတ်ကိုနှိပ်၍ ရက်စွဲနှင့် အချိန် ရွေးချယ်နိုင်ပါသည်',
        buttons: [
          {
            type: 'web_url',
            url: calendarUrl,
            title: '📅 ရက်ချိန်းယူမည်',
            messenger_extensions: true,
            webview_height_ratio: 'tall',
          } as any,
        ],
      },
    ]);
  } else {
    await sendMessengerQuickReplies(token, senderId, welcomeMsg, quickReplies.slice(0, 13));
  }
}

// ─── postback / quick reply ───
async function handlePostback(bot: any, token: string, senderId: string, payload: string) {
  const session = await getSession(bot.id, senderId);

  // ── Get Started (new user greeting) ──
  if (payload === 'GET_STARTED') {
    const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
    const defaultMsg = isEcommerce
      ? '🎉 မင်္ဂလာပါ! ကျွန်တော်တို့ဆိုင်မှ ကြိုဆိုပါတယ် 😊\n\nအောက်ပါ menu မှ ရွေးချယ်နိုင်ပါတယ်:\n📦 View Products - ပစ္စည်းများ ကြည့်ရှုရန်\n🧾 Check My Orders - မှာထားသော Order စစ်ရန်\n📞 Contact Us - ဆက်သွယ်ရန်\n\nဘာကူညီပေးရမလဲ? 😊'
      : '🎉 မင်္ဂလာပါ! ကျွန်တော်တို့ဆိုင်မှ ကြိုဆိုပါတယ် 😊\n\nဘာကူညီပေးရမလဲ? 😊';

    const welcomeMsg = bot.messengerWelcomeMessage ?? defaultMsg;

    // For GET_STARTED, show quick replies immediately
    const quickReplies: { title: string; payload: string }[] = [];
    if (isEcommerce) {
      quickReplies.push({ title: '📦 ပစ္စည်းများ', payload: 'SHOW_ALL_PRODUCTS' });
      quickReplies.push({ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' });
    } else {
      // Service bot: fixed service menu quick replies
      quickReplies.push({ title: '🛠️ ဝန်ဆောင်မှုများ', payload: 'MENU_VIEW_SERVICES' });
      quickReplies.push({ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' });
    }

    await sendMessengerQuickReplies(token, senderId, welcomeMsg, quickReplies.slice(0, 13));
    return;
  }

  // ── Persistent Menu ──
  if (payload === 'MENU_VIEW_PRODUCTS') {
    const products = await prisma.product.findMany({
      where: { botId: bot.id, isActive: true, productType: 'product' },
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

  if (payload === 'MENU_VIEW_SERVICES') {
    const services = await prisma.product.findMany({
      where: { botId: bot.id, isActive: true, productType: 'service' },
      orderBy: { category: 'asc' },
    });

    if (services.length > 0) {
      const elements = services.slice(0, 10).map((s: any) => ({
        title: s.name,
        subtitle: `${s.price > 0 ? `${s.price.toLocaleString()} Ks | ` : ''}${s.category}\n${s.description ? s.description.substring(0, 80) + '...' : ''}`,
        buttons: [
          {
            type: 'postback',
            title: '🛒 ဝယ်ယူမည်',
            payload: `SERVICE_BUY:${s.name}:${s.price}:0`,
          },
          {
            type: 'postback',
            title: '🔍 ကြည့်မည်',
            payload: `SERVICE_DETAIL:${s.id}`,
          },
        ],
      }));
      await sendMessengerGenericTemplate(token, senderId, elements);
    } else {
      await sendMessengerMessage(token, senderId, '🙏 လောလောဆယ် ဝန်ဆောင်မှုများ မရှိသေးပါ။');
    }
    return;
  }

  // ── Service Detail Handle ──
  if (payload.startsWith('SERVICE_DETAIL:')) {
    const serviceId = payload.replace('SERVICE_DETAIL:', '');
    const service = await prisma.product.findUnique({ where: { id: serviceId } });
    if (service) {
      const msg = `🛠️ ${service.name}\n\n💰 ဈေးနှုန်း: ${service.price > 0 ? `${service.price.toLocaleString()} Ks` : 'Free / Inquiry'}\n📌 Category: ${service.category}\n\n📝 အသေးစိတ်:\n${service.description || 'အချက်အလက် မရှိသေးပါ။'}`;
      await sendMessengerQuickReplies(token, senderId, msg, [
        { title: '🛒 ဝယ်ယူမည်', payload: `SERVICE_BUY:${service.name}:${service.price}:0` },
        { title: '🏠 အစသို့', payload: 'MENU_HOME' },
      ]);
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

  // ── Custom Menu Reply ──
  if (payload.startsWith('CUSTOM_REPLY:')) {
    const originalReplyText = payload.replace('CUSTOM_REPLY:', '');

    // Find the current menu item to check if it has buy option enabled
    const customMenu = (bot.messengerMenu as any[]) || [];
    const normalizedPayload = payload.replace(/\s+/g, '').trim();
    const menuItem = customMenu.find(
      (item: any) => item.payload && item.payload.replace(/\s+/g, '').trim() === normalizedPayload
    );

    if (
      menuItem?.enableBuyButton ||
      (bot.botType !== 'ecommerce' && payload.includes('ဝယ်ယူမည်'))
    ) {
      const replyText =
        originalReplyText + `\n\n📌 ဤဝန်ဆောင်မှုကို ရယူလိုပါက အောက်ပါ "ဝယ်ယူမည်" ကို နှိပ်ပါ။`;
      const requireAddressFlag = menuItem?.requireAddress ? '1' : '0';
      const itemTitle = menuItem?.title || 'Service';
      const itemPrice = menuItem?.price || 0;
      await sendMessengerQuickReplies(token, senderId, replyText, [
        {
          title: `🛒 ဝယ်ယူမည်`,
          payload: `SERVICE_BUY:${itemTitle}:${itemPrice}:${requireAddressFlag}`,
        },
      ]);
    } else {
      await sendMessengerMessage(token, senderId, originalReplyText);
    }
    return;
  }

  // ── Service Direct Buy (From Custom Menu) ──
  if (payload.startsWith('SERVICE_BUY:')) {
    // payload format: SERVICE_BUY:ServiceName:Price:RequireAddress
    const parts = payload.replace('SERVICE_BUY:', '').split(':');
    const serviceName = parts[0] || 'Service';
    const price = parseInt(parts[1] || '0', 10);
    const requireAddress = parts[2] === '1';

    const cart = [{ productId: `service_${Date.now()}`, name: serviceName, price: price, qty: 1 }];
    const subtotal = price;

    await updateSession(session.id, {
      state: 'collecting_name',
      cart: cart,
      pendingData: { subtotal, requireAddress },
    });

    const infoTypes = requireAddress ? 'လိပ်စာနှင့် ဆက်သွယ်ရန်' : 'ဆက်သွယ်ရန်';
    const summary = `📋 ဝန်ဆောင်မှု: ${serviceName}\n💰 တန်ဖိုး: ${price.toLocaleString()} Ks\n\n📝 ${infoTypes}အတွက် အချက်အလက်တွေ လိုပါမယ်\n\n👤 အမည် ထည့်ပေးပါ`;
    await sendMessengerMessage(token, senderId, summary);
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
      where: { botId: bot.id, isActive: true, productType: 'product' },
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
      const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
      const msg = isEcommerce
        ? '🛒 Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ။ ပစ္စည်းများ ကြည့်ရှုရန် →'
        : '🛒 Cart ထဲမှာ ဘာမှမရှိသေးပါ။';

      const buttons = isEcommerce
        ? [{ title: '📦 ကြည့်ရှုမည်', payload: 'SHOW_ALL_PRODUCTS' }]
        : [{ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' }];

      await sendMessengerQuickReplies(token, senderId, msg, buttons);
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
    const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
    const msg = '🗑️ Cart ကို ဖျက်လိုက်ပါပြီ။';
    const buttons = isEcommerce
      ? [{ title: '📦 ပစ္စည်းကြည့်မည်', payload: 'SHOW_ALL_PRODUCTS' }]
      : [{ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' }];

    await sendMessengerQuickReplies(token, senderId, msg, buttons);
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

  if (payload === 'CANCEL_ORDER' || payload === 'MENU_HOME') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
    const welcomeMsg =
      bot.messengerWelcomeMessage ??
      (isEcommerce
        ? '🙏 မင်္ဂလာပါ! ကျွန်တော်တို့ ဆိုင်မှ ကြိုဆိုပါတယ်။\n\nMenu မှ ရွေးချယ်၍ ကြည့်ရှုနိုင်ပါတယ် 😊'
        : '🙏 မင်္ဂလာပါ! ကျွန်တော်တို့ ဆိုင်မှ ကြိုဆိုပါတယ်။\n\nဘာကူညီပေးရမလဲ? 😊');

    const quickReplies: { title: string; payload: string }[] = [];
    if (isEcommerce) {
      quickReplies.push({ title: '📦 ပစ္စည်းများ', payload: 'SHOW_ALL_PRODUCTS' });
      quickReplies.push({ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' });
    } else {
      // Service bot: fixed quick replies
      quickReplies.push({ title: '🛠️ ဝန်ဆောင်မှုများ', payload: 'MENU_VIEW_SERVICES' });
      quickReplies.push({ title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' });
    }

    await sendMessengerQuickReplies(token, senderId, welcomeMsg, quickReplies.slice(0, 13));
    return;
  }

  if (payload.startsWith('TOWNSHIP_')) {
    const zoneId = payload.replace('TOWNSHIP_', '');
    const zone = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    if (zone) {
      if (bot.botType !== 'ecommerce' && !!bot.botType) {
        // Skip payment selection for Services/Info bots
        await finishOrder(bot, token, senderId, session, zone.township, zone.fee, 'N/A');
        return;
      }

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

  let order;
  try {
    order = await prisma.$transaction(async tx => {
      // 1. Ensure stock is still actually available for all items just before saving (Ecommerce only)
      if (bot.botType === 'ecommerce' || !bot.botType) {
        for (const item of cart) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product || product.stockCount < item.qty) {
            throw new Error(item.name);
          }
        }

        // 2. Decrement stock
        for (const item of cart) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockCount: { decrement: item.qty } },
          });
        }
      }

      // 3. Create the order
      return await tx.order.create({
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
    });
  } catch (error: any) {
    // Transaction aborted due to stock out
    await sendMessengerMessage(
      token,
      senderId,
      `⚠️ တောင်းပန်ပါတယ်ခင်ဗျာ။ "${error.message}" သည် လတ်တလော လက်ကျန်ကုန်သွားပါသဖြင့် အော်ဒါတင်၍မရတော့ပါ။ Cart ထဲမှ ပြန်ဖျက်ပေးပါရန် တောင်းပန်အပ်ပါသည်။`
    );
    return;
  }

  await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });

  const itemLines = cart
    .map(
      (item: any) =>
        `  🛒 ${item.name} x${item.qty} = ${(item.price * item.qty).toLocaleString()} Ks`
    )
    .join('\n');

  const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;

  let addressLine = '';
  if (isEcommerce) {
    addressLine = `\n🏠 ${pending.customerAddress || '-'}\n🏘️ ${township}`;
  } else if (pending.customerAddress && pending.customerAddress !== '-') {
    addressLine = `\n🏠 ${pending.customerAddress}`;
  }

  const paymentLine = isEcommerce ? `\n💳 ငွေချေစနစ်: ${paymentMethod}` : '';
  const deliveryLine = isEcommerce ? `\n🚗 Delivery: ${deliveryFee.toLocaleString()} Ks` : '';
  const itemsHeader = isEcommerce ? `📦 ပစ္စည်းများ:` : `📋 ဝန်ဆောင်မှု:`;
  const subtotalLine = isEcommerce
    ? `💰 ပစ္စည်းတန်ဖိုး: ${subtotal.toLocaleString()} Ks`
    : `💰 တန်ဖိုး: ${subtotal.toLocaleString()} Ks`;

  const confirmationMsg =
    `✅ ${isEcommerce ? 'Order' : 'Booking'} #${order.id.slice(-6).toUpperCase()} အတည်ပြုပြီးပါပြီ!\n\n` +
    `👤 ${pending.customerName || '-'}\n📱 ${pending.customerPhone || '-'}${addressLine}${paymentLine}\n\n` +
    `${itemsHeader}\n${itemLines}\n\n` +
    `${subtotalLine}${deliveryLine}\n💵 စုစုပေါင်း: ${total.toLocaleString()} Ks\n\n` +
    (paymentMethod === 'Bank Transfer/KPay'
      ? `📸 ငွေလွှဲအချက်အလက်များကို လက်ခံရရှိပါပြီ။\n📞 ကျနော်တို့ဘက်ကနေ စစ်ဆေးပြီး ဖုန်းဆက် အကြောင်းပြန်ကြားပေးပါမယ်ခင်ဗျာ။\n🙏 ${isEcommerce ? 'ဝယ်ယူအားပေးတဲ့' : 'ယုံကြည်စွာ ရွေးချယ်ပေးတဲ့'}အတွက် ကျေးဇူးတင်ပါတယ်!`
      : `📞 ဆိုင်ဘက်ကနေ ဖုန်းဆက်ပြီး အတည်ပြုပေးပါမယ်\n🙏 ${isEcommerce ? 'ဝယ်ယူအားပေးတဲ့' : 'ယုံကြည်စွာ ရွေးချယ်ပေးတဲ့'}အတွက် ကျေးဇူးတင်ပါတယ်!`);

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
