import { prisma } from '@/lib/prisma';
import { sendTelegramMessage, answerCallbackQuery } from '@/lib/telegram';
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
    customerPhone?: string | null;
    customerTownship?: string | null;
    items: any;
    total: number;
    paymentMethod?: string | null;
  }
) {
  if (!bot.adminBotToken || !bot.adminTelegramIds?.length) return;

  const items = Array.isArray(order.items)
    ? (order.items as any[]).map((i: any) => `• ${i.name} ×${i.qty || 1}`).join('\n')
    : String(order.items);

  const msg =
    `🔔 *New Order Received!*\n\n` +
    `🆔 #${order.id.slice(-6).toUpperCase()}\n` +
    `👤 ${order.customerName || '-'}\n` +
    `📱 ${order.customerPhone || '-'}\n` +
    `📍 ${order.customerTownship || '-'}\n\n` +
    `📦 *Items:*\n${items}\n\n` +
    `💵 *Total: ${order.total.toLocaleString()} Ks*\n` +
    `💳 ${order.paymentMethod || 'N/A'}`;

  // Notify all whitelisted admins — plain text, no buttons
  await Promise.allSettled(
    bot.adminTelegramIds.map(adminChatId =>
      sendTelegramMessage(bot.adminBotToken!, adminChatId, msg)
    )
  );
}
