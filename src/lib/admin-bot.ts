import { prisma } from '@/lib/prisma';
import { sendTelegramMessage, answerCallbackQuery } from '@/lib/telegram';
import { handleProductCommand, handleProductCallback, handleProductTextInput } from '@/lib/admin-bot/products';
import { handleZoneCommand, handleZoneCallback, handleZoneTextInput } from '@/lib/admin-bot/delivery-zones';
import { handleOrderCommand, handleOrderCallback } from '@/lib/admin-bot/orders';

type TBot = any;

// ─── Session helpers ──────────────────────────────────────────────────────────

async function getAdminSession(botId: string, chatId: string) {
  return prisma.adminBotSession.upsert({
    where: { botId_telegramChatId: { botId, telegramChatId: chatId } },
    create: { botId, telegramChatId: chatId, state: 'idle' },
    update: {},
  });
}

export async function updateAdminSession(id: string, data: any) {
  return prisma.adminBotSession.update({ where: { id }, data });
}

// ─── Auth check ───────────────────────────────────────────────────────────────

function isAuthorizedAdmin(bot: TBot, chatId: string): boolean {
  const allowedIds: string[] = bot.adminTelegramIds || [];
  return allowedIds.includes(chatId);
}

// ─── Main Menu ────────────────────────────────────────────────────────────────

async function sendMainMenu(token: string, chatId: string) {
  await sendTelegramMessage(
    token,
    chatId,
    `🛠 *Admin Dashboard*\n\nAdmin panel မှကြိုဆိုပါတယ်။ ဘာလုပ်ချင်ပါသလဲ?`,
    {
      inline_keyboard: [
        [
          { text: '📦 Products', callback_data: 'ADMIN_PRODUCTS' },
          { text: '🚚 Delivery Zones', callback_data: 'ADMIN_ZONES' },
        ],
        [
          { text: '📋 Orders', callback_data: 'ADMIN_ORDERS' },
        ],
      ],
    }
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleAdminBotUpdate(bot: TBot, token: string, update: any) {
  // ── Callback queries ──
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message.chat.id);
    await answerCallbackQuery(token, cq.id);

    if (!isAuthorizedAdmin(bot, chatId)) {
      await sendTelegramMessage(token, chatId, '⛔ Unauthorized. Admin access only.');
      return;
    }

    const data: string = cq.data;

    // Main menu navigation
    if (data === 'ADMIN_MENU') {
      await updateAdminSession(
        (await getAdminSession(bot.id, chatId)).id,
        { state: 'idle', pendingData: null }
      );
      await sendMainMenu(token, chatId);
      return;
    }

    // Products
    if (data === 'ADMIN_PRODUCTS' || data.startsWith('APROD_')) {
      await handleProductCallback(bot, token, chatId, data);
      return;
    }

    // Delivery Zones
    if (data === 'ADMIN_ZONES' || data.startsWith('AZONE_')) {
      await handleZoneCallback(bot, token, chatId, data);
      return;
    }

    // Orders
    if (data === 'ADMIN_ORDERS' || data.startsWith('AORDER_')) {
      await handleOrderCallback(bot, token, chatId, data);
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

    // Commands
    if (text === '/start' || text === '/menu') {
      await updateAdminSession(
        (await getAdminSession(bot.id, chatId)).id,
        { state: 'idle', pendingData: null }
      );
      await sendMainMenu(token, chatId);
      return;
    }

    if (text === '/products') {
      await handleProductCommand(bot, token, chatId);
      return;
    }

    if (text === '/zones') {
      await handleZoneCommand(bot, token, chatId);
      return;
    }

    if (text.startsWith('/orders')) {
      await handleOrderCommand(bot, token, chatId, text);
      return;
    }

    if (text === '/cancel') {
      await updateAdminSession(
        (await getAdminSession(bot.id, chatId)).id,
        { state: 'idle', pendingData: null }
      );
      await sendTelegramMessage(token, chatId, '❌ ပယ်ဖျက်ပြီးပါပြီ။', {
        inline_keyboard: [[{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }]],
      });
      return;
    }

    // ── State-based text input (multi-step flows) ──
    const session = await getAdminSession(bot.id, chatId);

    if (session.state.startsWith('adding_product') || session.state.startsWith('editing_product')) {
      await handleProductTextInput(bot, token, chatId, text, session);
      return;
    }

    if (session.state.startsWith('adding_zone') || session.state.startsWith('editing_zone')) {
      await handleZoneTextInput(bot, token, chatId, text, session);
      return;
    }

    // Default: show menu
    await sendMainMenu(token, chatId);
  }
}
