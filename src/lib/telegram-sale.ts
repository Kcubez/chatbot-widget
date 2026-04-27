/**
 * Telegram Sale Bot — Full Sales Flow Handler
 * Mirrors the Messenger Sale Bot logic but uses Telegram Bot API.
 *
 * Supports: ecommerce | service | appointment bot types
 * Session stored in TelegramSaleSession table (shared DB, separate table)
 */

import { prisma } from '@/lib/prisma';
import { generateBotResponse, verifyPaymentScreenshot } from '@/lib/ai';
import {
  sendTelegramMessage,
  sendTypingIndicator,
  sendTelegramPhotos,
  answerCallbackQuery,
  getTelegramFileUrl,
} from '@/lib/telegram';
import { syncOrderToSheet } from '@/lib/sheets';
import { notifyAdminNewOrder } from '@/lib/admin-bot';
import { after } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────

type TBot = {
  id: string;
  name: string;
  botType: string;
  primaryColor: string;
  telegramWelcomeMessage?: string | null;
  telegramContactMessage?: string | null;
  telegramPaymentMessage?: string | null;
  googleSheetId?: string | null;
  googleSheetName?: string | null;
  documents?: { content: string; title: string }[];
  [key: string]: any;
};

type TSession = {
  id: string;
  state: string;
  cart: any;
  pendingData: any;
};

// ─── Session helpers ──────────────────────────────────────────────────────────

async function getSession(botId: string, chatId: string): Promise<TSession> {
  return prisma.telegramSaleSession.upsert({
    where: { botId_telegramChatId: { botId, telegramChatId: chatId } },
    create: { botId, telegramChatId: chatId, state: 'browsing' },
    update: {},
  });
}

async function updateSession(id: string, data: Partial<TSession>) {
  return prisma.telegramSaleSession.update({ where: { id }, data });
}

// ─── Payment info helper ──────────────────────────────────────────────────────

function getPaymentInfo(bot: TBot): string {
  if (bot.telegramPaymentMessage) return bot.telegramPaymentMessage;
  if (bot.messengerPaymentMessage) return bot.messengerPaymentMessage;
  const docs = bot.documents || [];
  const payDoc = docs.find(
    d =>
      d.title.toLowerCase().includes('bank') ||
      d.title.toLowerCase().includes('payment') ||
      d.title.toLowerCase().includes('pay')
  );
  const fallback =
    '🏦 ငွေလွှဲရန် အကောင့်:\n• KBZ Pay: 09-000-000-000\n• Wave Pay: 09-000-000-000\n\nငွေလွှဲပြီးပါက Screenshot ပို့ပေးပါ 🙏';
  return payDoc ? payDoc.content : fallback;
}

// ─── Inline keyboard helpers ──────────────────────────────────────────────────

function inlineKeyboard(rows: { text: string; callback_data: string }[][]) {
  return { inline_keyboard: rows };
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function handleTelegramSaleUpdate(bot: TBot, token: string, update: any) {
  // Callback queries (button presses)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message.chat.id);
    const data: string = cq.data;

    await answerCallbackQuery(token, cq.id);

    const session = await getSession(bot.id, chatId);
    await handleCallback(bot, token, chatId, session, data);
    return;
  }

  // Photo messages
  if (update.message?.photo) {
    const chatId = String(update.message.chat.id);
    await handlePhoto(bot, token, chatId, update.message);
    return;
  }

  // Text messages
  if (update.message?.text) {
    const chatId = String(update.message.chat.id);
    const text: string = update.message.text;
    await handleText(bot, token, chatId, text);
    return;
  }
}

// ─── Text handler ─────────────────────────────────────────────────────────────

async function handleText(bot: TBot, token: string, chatId: string, text: string) {
  const session = await getSession(bot.id, chatId);
  const lowerText = text.trim().toLowerCase();

  // /start command
  if (text === '/start') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendWelcome(bot, token, chatId);
    return;
  }

  // Handle menu commands
  if (text === '/view_products' || text === '/view_services') {
    await updateSession(session.id, { state: 'browsing' });
    if (bot.botType === 'appointment' || bot.botType === 'service') {
      await showServices(bot, token, chatId);
    } else {
      await showProducts(bot, token, chatId);
    }
    return;
  }

  if (text === '/view_cart') {
    await showCart(bot, token, chatId, session);
    return;
  }

  if (text === '/check_orders') {
    // Re-use logic from MENU_CHECK_ORDERS
    const orders = await prisma.order.findMany({
      where: { botId: bot.id, telegramChatId: chatId, status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    if (orders.length === 0) {
      await sendTelegramMessage(
        token,
        chatId,
        '📦 မှာယူထားသော Order မရှိသေးပါ။',
        inlineKeyboard([[{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }]])
      );
    } else {
      let msg = '📦 *သင့် Orders:*\n\n';
      orders.forEach(o => {
        msg += `🧾 #${o.id.slice(-6).toUpperCase()}\n📅 ${new Date(o.createdAt).toLocaleDateString('en-GB')}\n🚚 ${o.status} | 💰 ${o.total.toLocaleString()} Ks\n\n`;
      });
      await sendTelegramMessage(
        token,
        chatId,
        msg,
        inlineKeyboard([[{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }]])
      );
    }
    return;
  }

  if (text === '/contact_us') {
    const msg =
      bot.telegramContactMessage ||
      bot.messengerContactMessage ||
      '📞 09-000-000-000 ကို ဆက်သွယ်နိုင်ပါတယ် 😊';
    await sendTelegramMessage(
      token,
      chatId,
      msg,
      inlineKeyboard([[{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }]])
    );
    return;
  }

  // Cancel command
  if (lowerText === '/cancel' || lowerText === 'cancel' || lowerText === 'ပယ်ဖျက်') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendTelegramMessage(
      token,
      chatId,
      '❌ ပယ်ဖျက်လိုက်ပါပြီ။ Menu ကို /start ဖြင့် ပြန်ကြည့်နိုင်ပါတယ်'
    );
    return;
  }

  // In a collection state — advance checkout flow
  if (session.state !== 'browsing') {
    await processStateAdvancement(bot, token, chatId, session, text);
    return;
  }

  // Browsing — fall through to AI
  await sendTypingIndicator(token, chatId);
  const aiResponse = await generateBotResponse(bot.id, text, [], 'telegram');
  await sendTelegramMessage(token, chatId, aiResponse);
}

// ─── Photo handler ────────────────────────────────────────────────────────────

async function handlePhoto(bot: TBot, token: string, chatId: string, message: any) {
  const session = await getSession(bot.id, chatId);

  if (session.state === 'collecting_payment_screenshot') {
    const photos = message.photo;
    const largest = photos[photos.length - 1];
    const fileUrl = await getTelegramFileUrl(token, largest.file_id);

    if (!fileUrl) {
      await sendTelegramMessage(token, chatId, '⚠️ ဓာတ်ပုံ download လုပ်လို့ မရပါ။ ထပ်ပို့ပေးပါ။');
      return;
    }

    // Lock session to prevent concurrent/retry verification
    await prisma.telegramSaleSession.update({
      where: { id: session.id },
      data: { state: 'verifying_payment' },
    });

    await sendTelegramMessage(token, chatId, '🔍 *စစ်ဆေးနေပါတယ်...* ခဏစောင့်ပါ');
    await sendTypingIndicator(token, chatId);

    const pending = (session.pendingData as any) || {};
    const expectedAmount = (pending.subtotal || 0) + (pending.deliveryFee || 0);

    after(async () => {
      try {
        const result = await verifyPaymentScreenshot(fileUrl, expectedAmount, bot.id);
        if (result.passed) {
          await finishOrder(
            bot,
            token,
            chatId,
            session,
            pending.township || 'N/A',
            pending.deliveryFee || 0,
            'Bank Transfer/KPay'
          );
        } else {
          await prisma.telegramSaleSession.update({
            where: { id: session.id },
            data: { state: 'collecting_payment_screenshot' },
          });
          await sendTelegramMessage(
            token,
            chatId,
            `❌ ${result.feedback}\n\nသေချာပြန်စစ်ပြီး Screenshot ပို့ပေးပါ 🙏`
          );
        }
      } catch (err) {
        console.error('[TelegramSale] Payment verification error (no retry):', err);
        try {
          const order = await prisma.order.create({
            data: {
              botId: bot.id,
              platform: 'telegram',
              telegramChatId: chatId,
              customerName: pending.name || 'Unknown',
              customerPhone: pending.phone || 'Unknown',
              customerAddress: pending.address || 'Unknown',
              customerTownship: pending.township || 'N/A',
              items: pending.items || [],
              subtotal: pending.subtotal || 0,
              deliveryFee: pending.deliveryFee || 0,
              total: (pending.subtotal || 0) + (pending.deliveryFee || 0),
              status: 'pending_manual_verification',
              paymentMethod: 'Bank Transfer/KPay',
            },
          });
          await updateSession(session.id, { state: 'browsing', pendingData: null });
          const fallbackMsg = `✅ *Order ကို လက်ခံရရှိပါတယ်!*

ငွေလွှဲပြေစာကို ယခုအချိန်တွင် system အနည်းငယ် စစ်ဆေးလို့မရနိုင်သေးပါ။ Admin မှ ထပ်မံ စစ်ဆေးပြီးသွားပါ့မယ်။

*Order ID:* \`${order.id}\`

ကျေးဇူးတင်ပါတယ်။ 🙏`;
          await sendTelegramMessage(token, chatId, fallbackMsg);
          notifyAdminNewOrder(bot as any, order).catch(console.error);
        } catch (fallbackErr) {
          console.error('[TelegramSale] Manual fallback also failed:', fallbackErr);
          await sendTelegramMessage(
            token,
            chatId,
            '⚠️ စနစ်မှာ အဆင်မပြေဖြစ်နေပါတယ်။ ခဏနေမှ ထပ်ကြိုးစားပေးပါခင်ဗျာ။ 🙏'
          );
        }
      }
    });
    return;
  }

  await sendTelegramMessage(token, chatId, '🙏 ပုံလက်ခံရရှိပါတယ်။ ဘာကူညီပေးရမလဲ?');
}

// ─── Callback handler ─────────────────────────────────────────────────────────

async function handleCallback(
  bot: TBot,
  token: string,
  chatId: string,
  session: TSession,
  data: string
) {
  // ── Main Menu ──
  if (data === 'MAIN_MENU' || data === 'START' || data === 'MENU_HOME') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendMainMenu(bot, token, chatId);
    return;
  }

  // ── Cancel Order ──
  if (data === 'CANCEL_ORDER') {
    await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });
    await sendTelegramMessage(
      token,
      chatId,
      '❌ ပယ်ဖျက်လိုက်ပါပြီ။ Menu ကို /start ဖြင့် ပြန်ကြည့်နိုင်ပါတယ်'
    );
    return;
  }

  // ── Show all products ──
  if (data === 'SHOW_ALL_PRODUCTS') {
    await showProducts(bot, token, chatId);
    return;
  }

  // ── Show services ──
  if (data === 'MENU_VIEW_SERVICES') {
    await showServices(bot, token, chatId);
    return;
  }

  // ── View cart ──
  if (data === 'VIEW_CART') {
    await showCart(bot, token, chatId, session);
    return;
  }

  // ── Clear cart ──
  if (data === 'CLEAR_CART') {
    await updateSession(session.id, { cart: null, pendingData: null, state: 'browsing' });
    await sendTelegramMessage(
      token,
      chatId,
      '🗑️ Cart ဖျက်လိုက်ပါပြီ။',
      inlineKeyboard([[{ text: '📦 ပစ္စည်းကြည့်မည်', callback_data: 'SHOW_ALL_PRODUCTS' }]])
    );
    return;
  }

  // ── Checkout ──
  if (data === 'CHECKOUT_NOW' || data === 'CONFIRM_ORDER') {
    const cart: any[] = (session.cart as any[]) || [];
    if (cart.length === 0) {
      await sendTelegramMessage(
        token,
        chatId,
        '🛒 Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ၊ ဦးစွာ ပစ္စည်းရွေးပေးပါ။'
      );
      return;
    }
    const subtotal = cart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
    let summary = `📋 *Order Summary*\n\n`;
    cart.forEach((i: any) => {
      summary += `• ${i.name} x${i.qty} = ${(i.price * i.qty).toLocaleString()} Ks\n`;
    });
    summary += `\n💰 *${subtotal.toLocaleString()} Ks*\n\n👤 အမည် ထည့်ပေးပါ`;
    await updateSession(session.id, { state: 'collecting_name', pendingData: { subtotal } });
    await sendTelegramMessage(
      token,
      chatId,
      summary,
      inlineKeyboard([
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }

  // ── Contact us ──
  if (data === 'MENU_CONTACT_US') {
    const msg =
      bot.telegramContactMessage ||
      bot.messengerContactMessage ||
      '📞 09-000-000-000 ကို ဆက်သွယ်နိုင်ပါတယ် 😊';
    await sendTelegramMessage(
      token,
      chatId,
      msg,
      inlineKeyboard([[{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }]])
    );
    return;
  }

  // ── Check orders ──
  if (data === 'MENU_CHECK_ORDERS') {
    const orders = await prisma.order.findMany({
      where: { botId: bot.id, telegramChatId: chatId, status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    if (orders.length === 0) {
      await sendTelegramMessage(
        token,
        chatId,
        '📦 မှာယူထားသော Order မရှိသေးပါ။',
        inlineKeyboard([[{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }]])
      );
    } else {
      let msg = '📦 *သင့် Orders:*\n\n';
      orders.forEach(o => {
        msg += `🧾 #${o.id.slice(-6).toUpperCase()}\n📅 ${new Date(o.createdAt).toLocaleDateString('en-GB')}\n🚚 ${o.status} | 💰 ${o.total.toLocaleString()} Ks\n\n`;
      });
      await sendTelegramMessage(
        token,
        chatId,
        msg,
        inlineKeyboard([[{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }]])
      );
    }
    return;
  }

  // ── Add to cart ──
  if (data.startsWith('ORDER_')) {
    const productId = data.replace('ORDER_', '');
    await handleAddToCart(bot, token, chatId, session, productId);
    return;
  }

  // ── Product detail ──
  if (data.startsWith('DETAIL_')) {
    const productId = data.replace('DETAIL_', '');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (product) {
      const msg = `📦 *${product.name}*\n🔖 Category: ${product.category}\n💰 Price: ${product.price.toLocaleString()} Ks${product.description ? `\n\n📝 ${product.description}` : ''}\n${product.stockCount > 0 ? `✅ Stock: ${product.stockCount}` : '❌ Out of Stock'}`;
      await sendTelegramMessage(
        token,
        chatId,
        msg,
        inlineKeyboard([
          [{ text: '🛒 Cart ထည့်မည်', callback_data: `ORDER_${product.id}` }],
          [{ text: '📦 ပစ္စည်းများကြည့်မည်', callback_data: 'SHOW_ALL_PRODUCTS' }],
        ])
      );
    }
    return;
  }

  // ── Service buy ──
  if (data.startsWith('SERVICE_BUY:')) {
    const parts = data.replace('SERVICE_BUY:', '').split(':');
    const serviceName = parts[0];
    const price = parseInt(parts[1] || '0', 10);
    const requireAddress = parts[2] === '1';
    const isAppt = bot.botType === 'appointment';
    const cart = [{ productId: `svc_${Date.now()}`, name: serviceName, price, qty: 1 }];

    await updateSession(session.id, {
      state: 'collecting_name',
      cart,
      pendingData: { subtotal: price, requireAddress },
    });
    const actionLabel = isAppt ? '👨‍⚕️ ဆရာဝန်' : '📋 ဝန်ဆောင်မှု';
    await sendTelegramMessage(
      token,
      chatId,
      `${actionLabel}: *${serviceName}*\n💰 ${price.toLocaleString()} Ks\n\n👤 အမည် ထည့်ပေးပါ`,
      inlineKeyboard([
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }

  // ── Payment COD ──
  if (data === 'PAY_COD') {
    const pending = (session.pendingData as any) || {};
    await finishOrder(
      bot,
      token,
      chatId,
      session,
      pending.township || 'N/A',
      pending.deliveryFee || 0,
      'COD'
    );
    return;
  }

  // ── Payment Bank ──
  if (data === 'PAY_BANK') {
    await updateSession(session.id, {
      state: 'collecting_payment_screenshot',
      pendingData: { ...(session.pendingData as any), paymentMethod: 'Bank Transfer/KPay' },
    });
    await sendTelegramMessage(
      token,
      chatId,
      getPaymentInfo(bot) + '\n\nငွေလွှဲပြီးပါက Screenshot နဲ့ ပြန်ပို့ပေးပါ 🙏'
    );
    return;
  }

  // ── Service detail ──
  if (data.startsWith('SERVICE_DETAIL:')) {
    const serviceId = data.replace('SERVICE_DETAIL:', '');
    const service = await prisma.product.findUnique({ where: { id: serviceId } });
    if (service) {
      const isAppt = bot.botType === 'appointment';
      const msg = `${isAppt ? '👨‍⚕️' : '🛠️'} *${service.name}*\n💰 ${service.price > 0 ? `${service.price.toLocaleString()} Ks` : 'Free / Inquiry'}\n📌 ${service.category}${service.description ? `\n\n📝 ${service.description}` : ''}`;
      await sendTelegramMessage(
        token,
        chatId,
        msg,
        inlineKeyboard([
          [
            {
              text: isAppt ? '📅 ရက်ချိန်းယူမည်' : '🛒 ဝယ်ယူမည်',
              callback_data: `SERVICE_BUY:${service.name}:${service.price}:0`,
            },
          ],
          [{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }],
        ])
      );
    }
    return;
  }

  // ── Delivery zone selection ──
  if (data.startsWith('TOWNSHIP_')) {
    const zoneId = data.replace('TOWNSHIP_', '');
    const zone = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    if (zone) {
      const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
      if (!isEcommerce) {
        await finishOrder(bot, token, chatId, session, zone.township, zone.fee, 'N/A');
        return;
      }
      await updateSession(session.id, {
        state: 'collecting_payment_method',
        pendingData: {
          ...(session.pendingData as any),
          township: zone.township,
          deliveryFee: zone.fee,
        },
      });
      await sendTelegramMessage(
        token,
        chatId,
        `✅ မြို့နယ်: ${zone.township} (${zone.fee.toLocaleString()} Ks)\n\n💳 ငွေပေးချေမှု ရွေးပါ:`,
        inlineKeyboard([
          [{ text: '💵 COD (လာရောက်ငွေပေး)', callback_data: 'PAY_COD' }],
          [{ text: '🏦 KPay / Bank Transfer', callback_data: 'PAY_BANK' }],
          [
            { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
            { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
          ],
        ])
      );
    }
    return;
  }

  // Date selection for appointments
  if (data.startsWith('DATE_')) {
    const dateKey = data.replace('DATE_', '');
    await processDateSelection(bot, token, chatId, session, dateKey);
    return;
  }

  // Slot selection
  if (data.startsWith('SLOT_')) {
    const slot = data.replace('SLOT_', '');
    await processSlotSelection(bot, token, chatId, session, slot);
    return;
  }
}

// ─── State advancement (checkout flow) ───────────────────────────────────────

async function processStateAdvancement(
  bot: TBot,
  token: string,
  chatId: string,
  session: TSession,
  text: string
) {
  const pending = (session.pendingData as any) || {};

  // Collecting name
  if (session.state === 'collecting_name') {
    const nameText = text.trim();
    if (!/[a-zA-Z\u1000-\u109F]/.test(nameText) || nameText.length < 2) {
      await sendTelegramMessage(
        token,
        chatId,
        '⚠️ အမည်မှန်ကန်စွာ ရိုက်ထည့်ပေးပါ',
        inlineKeyboard([
          [
            { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
            { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
          ],
        ])
      );
      return;
    }
    await updateSession(session.id, {
      state: 'collecting_phone',
      pendingData: { ...pending, customerName: nameText },
    });
    await sendTelegramMessage(
      token,
      chatId,
      `✅ အမည်: ${nameText}\n\n📱 ဖုန်းနံပါတ် ထည့်ပေးပါ`,
      inlineKeyboard([
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }

  // Collecting phone
  if (session.state === 'collecting_phone') {
    const phoneText = text.trim();
    if (!/^(?=(?:\D*\d){7,})[\d\s\+\-\(\)]+$/.test(phoneText)) {
      await sendTelegramMessage(
        token,
        chatId,
        '⚠️ ဖုန်းနံပါတ် မှန်ကန်စွာ ရိုက်ထည့်ပေးပါ',
        inlineKeyboard([
          [
            { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
            { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
          ],
        ])
      );
      return;
    }
    const newPending = { ...pending, customerPhone: phoneText };
    const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
    const isAppt = bot.botType === 'appointment';

    if (!isEcommerce) {
      if (isAppt) {
        // Appointment: collect date
        const serviceName = pending.customerService || session.cart?.[0]?.name;
        const service = await prisma.product.findFirst({
          where: { botId: bot.id, name: serviceName, productType: 'service' },
        });
        if (service?.availableSlots && service.availableSlots.startsWith('{')) {
          try {
            const parsed = JSON.parse(service.availableSlots);
            const dateKeys = Object.keys(parsed).sort();
            if (dateKeys.length > 0) {
              await updateSession(session.id, {
                state: 'collecting_date',
                pendingData: newPending,
              });
              const rows = dateKeys.slice(0, 8).map(dk => {
                const label = new Date(dk).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  weekday: 'short',
                });
                return [{ text: label, callback_data: `DATE_${dk}` }];
              });
              rows.push([
                { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
                { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
              ]);
              await sendTelegramMessage(
                token,
                chatId,
                `✅ ဖုန်း: ${phoneText}\n\n📅 ရက်စွဲ ရွေးပေးပါ:`,
                inlineKeyboard(rows)
              );
              return;
            }
          } catch {
            /* ignore parse error */
          }
        }
      }
      // Non-ecommerce, no address needed
      if ((pending.subtotal || 0) === 0) {
        await finishOrder(
          bot,
          token,
          chatId,
          { ...session, pendingData: newPending },
          'N/A',
          0,
          'N/A'
        );
        return;
      }
      await updateSession(session.id, {
        state: 'collecting_payment_screenshot',
        pendingData: { ...newPending, township: 'N/A', deliveryFee: 0 },
      });
      await sendTelegramMessage(
        token,
        chatId,
        `✅ ဖုန်း: ${phoneText}\n\n${getPaymentInfo(bot)}\n\nငွေလွှဲပြီးပါက Screenshot ပို့ပေးပါ 🙏`,
        inlineKeyboard([
          [
            { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
            { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
          ],
        ])
      );
      return;
    }

    // Ecommerce: collect address
    await updateSession(session.id, { state: 'collecting_address', pendingData: newPending });
    await sendTelegramMessage(
      token,
      chatId,
      `✅ ဖုန်း: ${phoneText}\n\n🏠 လိပ်စာ (ရပ်ကွက်/လမ်း/အိမ်) ထည့်ပေးပါ`,
      inlineKeyboard([
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }

  // Collecting address
  if (session.state === 'collecting_address') {
    const address = text.trim();
    const newPending = { ...pending, customerAddress: address };
    await updateSession(session.id, { state: 'collecting_township', pendingData: newPending });

    const zones = await prisma.deliveryZone.findMany({
      where: { botId: bot.id, isActive: true },
      orderBy: { township: 'asc' },
    });
    if (zones.length > 0) {
      const rows = zones.slice(0, 8).map(z => [
        {
          text: `${z.township} (${z.fee.toLocaleString()} Ks)`.substring(0, 32),
          callback_data: `TOWNSHIP_${z.id}`,
        },
      ]);
      rows.push([
        { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
        { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
      ]);
      await sendTelegramMessage(token, chatId, '🏘️ မြို့နယ် ရွေးပေးပါ:', inlineKeyboard(rows));
    } else {
      await sendTelegramMessage(
        token,
        chatId,
        '🏘️ မြို့နယ် ရိုက်ထည့်ပေးပါ',
        inlineKeyboard([
          [
            { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
            { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
          ],
        ])
      );
    }
    return;
  }

  // Collecting township (fallback typed text)
  if (session.state === 'collecting_township') {
    const zones = await prisma.deliveryZone.findMany({ where: { botId: bot.id, isActive: true } });
    if (zones.length > 0) {
      const rows = zones.slice(0, 8).map(z => [
        {
          text: `${z.township} (${z.fee.toLocaleString()} Ks)`.substring(0, 32),
          callback_data: `TOWNSHIP_${z.id}`,
        },
      ]);
      rows.push([
        { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
        { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
      ]);
      await sendTelegramMessage(
        token,
        chatId,
        '⚠️ ခလုတ်ထဲမှ မြို့နယ်ကို ရွေးချယ်ပေးပါ:',
        inlineKeyboard(rows)
      );
      return;
    }
    // No zones — accept typed text
    const newPending = { ...pending, township: text.trim(), deliveryFee: 0 };
    await updateSession(session.id, {
      state: 'collecting_payment_method',
      pendingData: newPending,
    });
    await sendTelegramMessage(
      token,
      chatId,
      '💳 ငွေပေးချေမှု ရွေးပါ:',
      inlineKeyboard([
        [{ text: '💵 COD (လာရောက်ငွေပေး)', callback_data: 'PAY_COD' }],
        [{ text: '🏦 KPay / Bank Transfer', callback_data: 'PAY_BANK' }],
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }

  // Collecting payment method via text (fallback)
  if (session.state === 'collecting_payment_method') {
    await sendTelegramMessage(
      token,
      chatId,
      '⚠️ ခလုတ်ထဲမှ ငွေပေးချေမှုစနစ်ကို ရွေးပေးပါ:',
      inlineKeyboard([
        [{ text: '💵 COD (လာရောက်ငွေပေး)', callback_data: 'PAY_COD' }],
        [{ text: '🏦 KPay / Bank Transfer', callback_data: 'PAY_BANK' }],
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }

  // Collecting date (text fallback)
  if (session.state === 'collecting_date') {
    await sendTelegramMessage(
      token,
      chatId,
      '⚠️ ခလုတ်ထဲမှ ရက်စွဲကို ရွေးပေးပါ',
      inlineKeyboard([
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }

  // Collecting slots (text fallback)
  if (session.state === 'collecting_slots') {
    await sendTelegramMessage(
      token,
      chatId,
      '⚠️ ခလုတ်ထဲမှ အချိန်ကို ရွေးပေးပါ',
      inlineKeyboard([
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }

  // Collecting payment screenshot (text when photo expected)
  if (session.state === 'collecting_payment_screenshot') {
    await sendTelegramMessage(
      token,
      chatId,
      '📸 *ငွေလွှဲ Screenshot ကို ပြပါ*\n\n' + getPaymentInfo(bot),
      inlineKeyboard([
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
    return;
  }
}

// ─── Date / Slot selection (appointments) ────────────────────────────────────

async function processDateSelection(
  bot: TBot,
  token: string,
  chatId: string,
  session: TSession,
  dateKey: string
) {
  const pending = (session.pendingData as any) || {};
  const serviceName = pending.customerService || session.cart?.[0]?.name;
  const service = await prisma.product.findFirst({
    where: { botId: bot.id, name: serviceName, productType: 'service' },
  });

  if (service?.availableSlots && service.availableSlots.startsWith('{')) {
    try {
      const parsed = JSON.parse(service.availableSlots);
      const slots: string[] = parsed[dateKey] || [];
      const newPending = { ...pending, appointmentDate: dateKey };
      await updateSession(session.id, { state: 'collecting_slots', pendingData: newPending });

      if (slots.length > 0) {
        const rows = slots.slice(0, 8).map(s => [{ text: s, callback_data: `SLOT_${s}` }]);
        rows.push([
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ]);
        const dateLabel = new Date(dateKey).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          weekday: 'short',
        });
        await sendTelegramMessage(
          token,
          chatId,
          `✅ ရက်စွဲ: ${dateLabel}\n\n🕘 အချိန် ရွေးပေးပါ:`,
          inlineKeyboard(rows)
        );
      } else {
        await sendTelegramMessage(
          token,
          chatId,
          '📅 ရက်စွဲ လက်ခံပြီး။ ပြသလိုသည့် အချိန်ကို ရိုက်ထည့်ပေးပါ',
          inlineKeyboard([
            [
              { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
              { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
            ],
          ])
        );
      }
    } catch {
      /* ignore */
    }
  }
}

async function processSlotSelection(
  bot: TBot,
  token: string,
  chatId: string,
  session: TSession,
  slot: string
) {
  const pending = { ...(session.pendingData as any), appointmentTime: slot };
  const subtotal = pending.subtotal || 0;
  if (subtotal === 0) {
    await finishOrder(bot, token, chatId, { ...session, pendingData: pending }, 'N/A', 0, 'N/A');
  } else {
    await updateSession(session.id, {
      state: 'collecting_payment_screenshot',
      pendingData: { ...pending, township: 'N/A', deliveryFee: 0 },
    });
    await sendTelegramMessage(
      token,
      chatId,
      `✅ အချိန်: ${slot}\n💰 ပြသခ: ${subtotal.toLocaleString()} Ks\n\n${getPaymentInfo(bot)}\n\nငွေလွှဲပြီးပါက Screenshot ပို့ပေးပါ 🙏`,
      inlineKeyboard([
        [
          { text: '☰ Menu - ကြည့်ရန်', callback_data: 'MAIN_MENU' },
          { text: '❌ ပယ်ဖျက်မည်', callback_data: 'CANCEL_ORDER' },
        ],
      ])
    );
  }
}

// ─── Add to cart ──────────────────────────────────────────────────────────────

async function handleAddToCart(
  bot: TBot,
  token: string,
  chatId: string,
  session: TSession,
  productId: string
) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.stockCount <= 0) {
    await sendTelegramMessage(token, chatId, `⚠️ ${product?.name || 'ပစ္စည်း'} လက်ကျန် မရှိတော့ပါ`);
    return;
  }

  const currentCart: any[] = (session.cart as any[]) || [];
  const existingIdx = currentCart.findIndex((i: any) => i.productId === product.id);
  const existingQty = existingIdx >= 0 ? currentCart[existingIdx].qty : 0;

  if (existingQty + 1 > product.stockCount) {
    await sendTelegramMessage(
      token,
      chatId,
      `⚠️ ${product.name} — Stock ${product.stockCount} ခုသာ ရှိပါတယ် (Cart: ${existingQty} ခု)`
    );
    return;
  }

  const newCart =
    existingIdx >= 0
      ? currentCart.map((i: any, idx: number) =>
          idx === existingIdx ? { ...i, qty: i.qty + 1 } : i
        )
      : [
          ...currentCart,
          { productId: product.id, name: product.name, price: product.price, qty: 1 },
        ];

  const subtotal = newCart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
  const totalItems = newCart.reduce((s: number, i: any) => s + i.qty, 0);
  await updateSession(session.id, { cart: newCart, pendingData: { subtotal } });

  await sendTelegramMessage(
    token,
    chatId,
    `✅ *${product.name}* Cart ထည့်ပြီး!\n🛒 ${totalItems} မျိုး | ${subtotal.toLocaleString()} Ks`,
    inlineKeyboard([
      [
        { text: '🛍️ ဆက်ဝယ်မည်', callback_data: 'SHOW_ALL_PRODUCTS' },
        { text: `🛒 Cart (${totalItems})`, callback_data: 'VIEW_CART' },
      ],
      [{ text: '💳 Checkout', callback_data: 'CHECKOUT_NOW' }],
    ])
  );
}

// ─── Show products ────────────────────────────────────────────────────────────

async function showProducts(bot: TBot, token: string, chatId: string) {
  const products = await prisma.product.findMany({
    where: { botId: bot.id, isActive: true, productType: 'product' },
    orderBy: { category: 'asc' },
  });

  if (products.length === 0) {
    await sendTelegramMessage(
      token,
      chatId,
      '🙏 လောလောဆယ် ပစ္စည်းများ မရှိသေးပါ',
      inlineKeyboard([[{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }]])
    );
    return;
  }

  for (const product of products.slice(0, 10)) {
    const stockBadge =
      product.stockCount > 0 ? `✅ Stock: ${product.stockCount}` : '❌ Out of Stock';
    const msg = `📦 *${product.name}*\n💰 ${product.price.toLocaleString()} Ks | ${product.category}\n${stockBadge}${product.description ? `\n📝 ${product.description.substring(0, 100)}` : ''}`;

    const keyboard =
      product.stockCount > 0
        ? inlineKeyboard([
            [
              { text: '🛒 Cart ထည့်မည်', callback_data: `ORDER_${product.id}` },
              { text: '🔍 Detail', callback_data: `DETAIL_${product.id}` },
            ],
          ])
        : inlineKeyboard([[{ text: '📦 ဆက်ကြည့်မည်', callback_data: 'SHOW_ALL_PRODUCTS' }]]);

    if (product.image) {
      await sendTelegramPhotos(token, chatId, [product.image]);
    }
    await sendTelegramMessage(token, chatId, msg, keyboard);
  }
}

// ─── Show services ────────────────────────────────────────────────────────────

async function showServices(bot: TBot, token: string, chatId: string) {
  const isAppt = bot.botType === 'appointment';
  const services = await prisma.product.findMany({
    where: { botId: bot.id, isActive: true, productType: 'service' },
    orderBy: { category: 'asc' },
  });

  if (services.length === 0) {
    await sendTelegramMessage(
      token,
      chatId,
      isAppt ? '🏥 ရောဂါကု ဆရာဝန်မရှိသေးပါ' : '🛠️ ဝန်ဆောင်မှုမရှိသေးပါ',
      inlineKeyboard([[{ text: '🏠 Menu', callback_data: 'MAIN_MENU' }]])
    );
    return;
  }

  for (const service of services.slice(0, 10)) {
    const priceText = service.price > 0 ? `${service.price.toLocaleString()} Ks` : 'Free / Inquiry';
    const icon = isAppt ? '👨‍⚕️' : '🛠️';
    const msg = `${icon} *${service.name}*\n💰 ${priceText} | ${service.category}${service.description ? `\n📝 ${service.description.substring(0, 100)}` : ''}`;
    await sendTelegramMessage(
      token,
      chatId,
      msg,
      inlineKeyboard([
        [
          {
            text: isAppt ? '📅 ရက်ချိန်းယူမည်' : '🛒 ဝယ်ယူမည်',
            callback_data: `SERVICE_BUY:${service.name}:${service.price}:0`,
          },
          { text: '🔍 Detail', callback_data: `SERVICE_DETAIL:${service.id}` },
        ],
      ])
    );
  }
}

// ─── Show cart ────────────────────────────────────────────────────────────────

async function showCart(bot: TBot, token: string, chatId: string, session: TSession) {
  const cart: any[] = (session.cart as any[]) || [];
  if (cart.length === 0) {
    await sendTelegramMessage(
      token,
      chatId,
      '🛒 Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ',
      inlineKeyboard([[{ text: '📦 ပစ္စည်းကြည့်မည်', callback_data: 'SHOW_ALL_PRODUCTS' }]])
    );
    return;
  }
  let msg = '🛒 *သင့် Cart:*\n\n';
  const total = cart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
  cart.forEach((i: any) => {
    msg += `• ${i.name} x${i.qty}  →  ${(i.price * i.qty).toLocaleString()} Ks\n`;
  });
  msg += `\n💰 *${total.toLocaleString()} Ks*`;
  await sendTelegramMessage(
    token,
    chatId,
    msg,
    inlineKeyboard([
      [
        { text: '💳 Checkout', callback_data: 'CHECKOUT_NOW' },
        { text: '🛍️ ဆက်ဝယ်မည်', callback_data: 'SHOW_ALL_PRODUCTS' },
      ],
      [{ text: '🗑️ Cart ဖျက်မည်', callback_data: 'CLEAR_CART' }],
    ])
  );
}

// ─── Welcome / Main menu ──────────────────────────────────────────────────────

async function sendWelcome(bot: TBot, token: string, chatId: string) {
  const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
  const isAppt = bot.botType === 'appointment';
  const welcomeMsg =
    bot.telegramWelcomeMessage ||
    bot.messengerWelcomeMessage ||
    `🙏 မင်္ဂလာပါ! *${bot.name}* မှ ကြိုဆိုပါတယ် 😊\n\nMenu ကို ရွေးချယ်ပေးပါ 👇`;
  await sendTelegramMessage(
    token,
    chatId,
    welcomeMsg,
    inlineKeyboard([[{ text: '☰ Menu ကြည့်မည်', callback_data: 'MAIN_MENU' }]])
  );
}

async function sendMainMenu(bot: TBot, token: string, chatId: string) {
  const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;
  const isAppt = bot.botType === 'appointment';
  const isService = bot.botType === 'service';

  const rows: { text: string; callback_data: string }[][] = [];

  if (isEcommerce) {
    rows.push([{ text: '📦 ပစ္စည်းများ', callback_data: 'SHOW_ALL_PRODUCTS' }]);
    rows.push([
      { text: '🧾 မှာယူထားသည်', callback_data: 'MENU_CHECK_ORDERS' },
      { text: '🛒 Cart', callback_data: 'VIEW_CART' },
    ]);
  } else if (isAppt) {
    rows.push([{ text: '👨‍⚕️ ဆရာဝန်/ဝန်ဆောင်မှုများ', callback_data: 'MENU_VIEW_SERVICES' }]);
    rows.push([{ text: '🧾 ရက်ချိန်းစစ်ရန်', callback_data: 'MENU_CHECK_ORDERS' }]);
  } else if (isService) {
    rows.push([{ text: '🛠️ ဝန်ဆောင်မှုများ', callback_data: 'MENU_VIEW_SERVICES' }]);
    rows.push([{ text: '🧾 မှာယူထားသည်', callback_data: 'MENU_CHECK_ORDERS' }]);
  }

  rows.push([{ text: '📞 ဆက်သွယ်ရန်', callback_data: 'MENU_CONTACT_US' }]);

  const menuTitle = isEcommerce
    ? '📦 ပစ္စည်းများ | 🧾 Orders | 📞 ဆက်သွယ်ရန်'
    : isAppt
      ? '🏥 Menu 😊'
      : '🛠️ Menu 😊';

  await sendTelegramMessage(token, chatId, menuTitle, inlineKeyboard(rows));
}

// ─── Finish order ─────────────────────────────────────────────────────────────

async function finishOrder(
  bot: TBot,
  token: string,
  chatId: string,
  session: any,
  township: string,
  deliveryFee: number,
  paymentMethod: string
) {
  const cart: any[] = (session.cart as any[]) || [];
  const pending = (session.pendingData as any) || {};
  const subtotal = pending.subtotal || cart.reduce((s: number, i: any) => s + i.price * i.qty, 0);
  const total = subtotal + deliveryFee;

  let order: any;
  try {
    order = await prisma.$transaction(async tx => {
      // Decrement stock (ecommerce only)
      if (bot.botType === 'ecommerce' || !bot.botType) {
        for (const item of cart) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product || product.stockCount < item.qty) throw new Error(item.name);
        }
        for (const item of cart) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockCount: { decrement: item.qty } },
          });
        }
      }
      return tx.order.create({
        data: {
          botId: bot.id,
          platform: 'telegram',
          telegramChatId: chatId,
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
          appointmentDate: pending.appointmentDate || null,
          appointmentTime: pending.appointmentTime || null,
        },
      });
    });
  } catch (error: any) {
    await sendTelegramMessage(
      token,
      chatId,
      `⚠️ "${error.message}" လက်ကျန် မရှိတော့ပါ။ Cart ဖျက်ပြီး ပြန်မှာပေးပါ။`
    );
    return;
  }

  await updateSession(session.id, { state: 'browsing', cart: null, pendingData: null });

  const isAppt = bot.botType === 'appointment';
  const isEcommerce = bot.botType === 'ecommerce' || !bot.botType;

  const itemLines = cart
    .map(
      i => `  ${isAppt ? '👨‍⚕️' : '•'} ${i.name} x${i.qty} = ${(i.price * i.qty).toLocaleString()} Ks`
    )
    .join('\n');

  let confirmation =
    `✅ *${isAppt ? 'Appointment' : isEcommerce ? 'Order' : 'Booking'} #${order.id.slice(-6).toUpperCase()} အတည်ပြုပြီး!*\n\n` +
    `👤 ${pending.customerName || '-'}\n📱 ${pending.customerPhone || '-'}` +
    (isEcommerce ? `\n🏠 ${pending.customerAddress || '-'}\n🏘️ ${township}` : '') +
    (pending.appointmentDate ? `\n📅 ${pending.appointmentDate}` : '') +
    (pending.appointmentTime ? ` ${pending.appointmentTime}` : '') +
    `\n\n${itemLines}\n\n` +
    `💰 ${subtotal.toLocaleString()} Ks` +
    (deliveryFee > 0 ? `\n🚗 Delivery: ${deliveryFee.toLocaleString()} Ks` : '') +
    `\n💵 *${total.toLocaleString()} Ks*\n\n` +
    (paymentMethod === 'Bank Transfer/KPay'
      ? `📸 ငွေလွှဲ စစ်ဆေးပြီး ဆက်သွယ်ပေးပါမယ် 🙏`
      : `📞 ဆိုင်ဘက်ကနေ ဆက်သွယ်ပေးပါမယ် 🙏`);

  await sendTelegramMessage(
    token,
    chatId,
    confirmation,
    inlineKeyboard([[{ text: '🏠 Menu သို့', callback_data: 'MAIN_MENU' }]])
  );

  // Google Sheets sync
  if (bot.googleSheetId) {
    try {
      const synced = await syncOrderToSheet(
        bot.googleSheetId,
        bot.googleSheetName || 'Orders',
        order
      );
      if (synced)
        await prisma.order.update({ where: { id: order.id }, data: { sheetSynced: true } });
    } catch (err) {
      console.error('Sheets sync failed:', err);
    }
  }
}
