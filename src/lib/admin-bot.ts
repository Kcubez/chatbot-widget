import { prisma } from '@/lib/prisma';
import {
  sendTelegramMessage,
  sendTelegramPhotoFromUrl,
  answerCallbackQuery,
  editTelegramMessageReplyMarkup,
} from '@/lib/telegram';
import { sendMessengerMessage } from '@/lib/messenger';
import { handleOrderCallback } from '@/lib/admin-bot/orders';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminBot = {
  id: string;
  adminBotToken: string | null;
  adminTelegramIds: string[];
  name: string;
};

type TUpdate = any;

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorizedAdmin(bot: AdminBot, chatId: string): boolean {
  return (bot.adminTelegramIds || []).includes(chatId);
}

// ─── Main Menu ────────────────────────────────────────────────────────────────

async function sendMainMenu(token: string, chatId: string) {
  await sendTelegramMessage(
    token,
    chatId,
    `🛠 *Admin Panel — ${new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Yangon' })}*\n\nBusiness ကို manage လုပ်ရန် အောက်ကကို ရွေးပါ:`,
    {
      inline_keyboard: [
        [{ text: '📋 Orders', callback_data: 'ADMIN_ORDERS' }],
        [
          { text: '🟡 Pending', callback_data: 'ADMIN_ORDERS_F_pending' },
          { text: '🟢 Confirmed', callback_data: 'ADMIN_ORDERS_F_confirmed' },
        ],
        [
          { text: '📦 Shipped', callback_data: 'ADMIN_ORDERS_F_shipped' },
          { text: '✅ Delivered', callback_data: 'ADMIN_ORDERS_F_delivered' },
        ],
      ],
    }
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleAdminBotUpdate(bot: AdminBot, token: string, update: TUpdate) {
  // ── Callback queries ──
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message.chat.id);

    // Answer immediately to dismiss the loading spinner
    answerCallbackQuery(token, cq.id).catch(() => null);

    if (!isAuthorizedAdmin(bot, chatId)) {
      await sendTelegramMessage(token, chatId, '⛔ Unauthorized. Admin access only.');
      return;
    }

    const data: string = cq.data;

    if (data === 'ADMIN_MENU') {
      await sendMainMenu(token, chatId);
      return;
    }

    // Shortcut filter buttons on main menu
    if (data.startsWith('ADMIN_ORDERS_F_')) {
      const status = data.replace('ADMIN_ORDERS_F_', '');
      await handleOrderCallback(bot as any, token, chatId, `AORDER_FILTER_${status}`);
      return;
    }

    if (data.startsWith('ADMIN_REMIND_SENT_')) {
      const orderId = data.replace('ADMIN_REMIND_SENT_', '');
      await handleAdminRemindSent(bot, token, chatId, cq.message.message_id, orderId);
      return;
    }

    if (data === 'ADMIN_REMIND_SENT_DONE_NOOP') {
      return;
    }

    if (data === 'ADMIN_ORDERS' || data.startsWith('AORDER_')) {
      await handleOrderCallback(bot as any, token, chatId, data);
      return;
    }

    return;
  }

  // ── Text messages ──
  if (update.message?.text) {
    const chatId = String(update.message.chat.id);
    const text: string = update.message.text.trim();

    if (!isAuthorizedAdmin(bot, chatId)) {
      await sendTelegramMessage(token, chatId, '⛔ Unauthorized. Admin access only.');
      return;
    }

    if (text === '/start' || text === '/menu' || text === '/help') {
      await sendMainMenu(token, chatId);
      return;
    }

    if (text === '/orders' || text.startsWith('/orders ')) {
      const parts = text.split(/\s+/);
      const statusFilter = parts[1];
      await handleOrderCallback(bot as any, token, chatId, statusFilter
        ? `AORDER_FILTER_${statusFilter}`
        : 'ADMIN_ORDERS'
      );
      return;
    }

    // Default
    await sendMainMenu(token, chatId);
  }
}

// ─── Push notification — called from sale bot on new order ───────────────────

export async function notifyAdminNewOrder(
  bot: AdminBot,
  order: {
    id: string;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerTownship?: string | null;
    items: any;
    total: number;
    paymentMethod?: string | null;
  },
  receiptPhotoUrl?: string | null
) {
  if (!bot.adminBotToken || !bot.adminTelegramIds?.length) return;

  const items = Array.isArray(order.items)
    ? (order.items as any[]).map((i: any) => `• ${i.name} ×${i.qty || 1}`).join('\n')
    : String(order.items);

  const townshipLine =
    order.customerTownship &&
    order.customerTownship !== 'N/A' &&
    order.customerTownship !== 'Unknown'
      ? `📍 ${order.customerTownship}\n`
      : '';

  const msg =
    `🔔 *New Order Received!*\n\n` +
    `🆔 #${order.id.slice(-6).toUpperCase()}\n` +
    `👤 ${order.customerName || '-'}\n` +
    `📧 ${order.customerEmail || '-'}\n` +
    `📱 ${order.customerPhone || '-'}\n` +
    townshipLine +
    `\n📦 *Items:*\n${items}\n\n` +
    `💵 *Total: ${order.total.toLocaleString()} Ks*\n` +
    `💳 ${order.paymentMethod || 'N/A'}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '📧 Ebook ပို့ပြီးကြောင်း Remind မည်',
          callback_data: `ADMIN_REMIND_SENT_${order.id}`,
        },
      ],
    ],
  };

  // Notify all whitelisted admins
  await Promise.allSettled(
    bot.adminTelegramIds.map(async adminChatId => {
      await sendTelegramMessage(bot.adminBotToken!, adminChatId, msg, replyMarkup);
      if (receiptPhotoUrl) {
        await sendTelegramPhotoFromUrl(
          bot.adminBotToken!,
          adminChatId,
          receiptPhotoUrl,
          `🧾 Receipt for #${order.id.slice(-6).toUpperCase()}`
        );
      }
    })
  );
}

/**
 * Handle admin clicking the reminder button
 */
async function handleAdminRemindSent(
  bot: AdminBot,
  token: string,
  chatId: string,
  messageId: number,
  orderId: string
) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { bot: true },
    });

    if (!order) {
      await sendTelegramMessage(token, chatId, '❌ Order ရှာမတွေ့ပါ။');
      return;
    }

    if (order.status === 'delivered') {
      await sendTelegramMessage(token, chatId, '⚠️ ဤ Order သည် ပို့ပြီးသားဖြစ်နေပါသည် (သို့မဟုတ်) Remind လုပ်ပြီးသားဖြစ်နေပါသည်။');
      // Update inline keyboard to show done state
      await editTelegramMessageReplyMarkup(token, chatId, messageId, {
        inline_keyboard: [
          [
            {
              text: '✅ Ebook ပို့ပြီးကြောင်း Remind လုပ်ပြီးပါပြီ',
              callback_data: 'ADMIN_REMIND_SENT_DONE_NOOP',
            },
          ],
        ],
      });
      return;
    }

    // Update status in DB
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'delivered' },
    });

    // Notify customer
    if (order.platform === 'telegram' && order.bot.telegramBotToken && order.telegramChatId) {
      const customerMsg =
        `📧 *Ebook ပို့ဆောင်ပြီးပါပြီရှင်!*\n\n` +
        `လူကြီးမင်းဝယ်ယူထားသည့် Ebook များကို email: *${order.customerEmail || ''}* သို့ ပို့ပေးလိုက်ပါပြီရှင်။\n\n` +
        `ကျေးဇူးတင်ပါတယ်ရှင်! 🙏`;
      await sendTelegramMessage(order.bot.telegramBotToken, order.telegramChatId, customerMsg);
    } else if (order.platform === 'messenger' && order.bot.messengerPageToken && order.messengerSenderId) {
      const customerMsg =
        `📧 Ebook ပို့ဆောင်ပြီးပါပြီရှင်!\n\n` +
        `လူကြီးမင်းဝယ်ယူထားသည့် Ebook များကို email: ${order.customerEmail || ''} သို့ ပို့ပေးလိုက်ပါပြီရှင်။\n\n` +
        `ကျေးဇူးတင်ပါတယ်ရှင်! 🙏`;
      await sendMessengerMessage(order.bot.messengerPageToken, order.messengerSenderId, customerMsg);
    }

    // Update admin bot button reply markup
    await editTelegramMessageReplyMarkup(token, chatId, messageId, {
      inline_keyboard: [
        [
          {
            text: '✅ Ebook ပို့ပြီးကြောင်း Remind လုပ်ပြီးပါပြီ',
            callback_data: 'ADMIN_REMIND_SENT_DONE_NOOP',
          },
        ],
      ],
    });

    // Send confirmation to admin
    await sendTelegramMessage(token, chatId, `✅ Order #${order.id.slice(-6).toUpperCase()} အတွက် Customer ထံ သို့ email remind ပို့ပြီးပါပြီ။`);
  } catch (error) {
    console.error('Error in handleAdminRemindSent:', error);
    await sendTelegramMessage(token, chatId, '⚠️ Remind လုပ်ရာတွင် အမှားအယွင်းတစ်ခု ရှိသွားပါသည်။');
  }
}
