import { prisma } from '@/lib/prisma';
import {
  sendTelegramMessage,
  sendTelegramPhotoFromUrl,
  answerCallbackQuery,
  editTelegramMessageReplyMarkup,
} from '@/lib/telegram';
import { sendMessengerMessage } from '@/lib/messenger';
import { handleOrderCallback } from '@/lib/admin-bot/orders';
import { syncOrderToSheet, deductStockInSheet } from '@/lib/sheets';
import {
  MSG_PAYMENT_ACCEPTED,
  MSG_PAYMENT_REJECTED,
} from '@/lib/payment-review';
import { after } from 'next/server';

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

/** Human label for the admin who tapped a button (shown to other admins). */
function adminLabel(from: any): string {
  const name =
    from?.first_name ||
    from?.username ||
    (from?.id ? `Admin ${from.id}` : 'Admin');
  return String(name).substring(0, 32);
}

/**
 * Edit ALL tracked admin notice messages for an order (multi-admin sync).
 * Failures (deleted messages etc.) are ignored.
 */
async function syncAdminDecisionMarkup(
  bot: AdminBot,
  refs: unknown,
  label: string
) {
  const list = Array.isArray(refs) ? refs : [];
  await Promise.allSettled(
    list.map(ref => {
      const chatId = (ref as any)?.chatId;
      const messageId = (ref as any)?.messageId;
      if (!chatId || typeof messageId !== 'number') return Promise.resolve();
      return editTelegramMessageReplyMarkup(bot.adminBotToken!, String(chatId), messageId, {
        inline_keyboard: [[{ text: label, callback_data: 'ADMIN_PAYMENT_DECISION_DONE_NOOP' }]],
      });
    })
  );
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

    // NOTE: exact NOOP match must come BEFORE the prefix branch below —
    // 'ADMIN_REMIND_SENT_DONE_NOOP'.startsWith('ADMIN_REMIND_SENT_') is true.
    if (data === 'ADMIN_REMIND_SENT_DONE_NOOP') {
      return;
    }

    if (data.startsWith('ADMIN_REMIND_SENT_')) {
      const orderId = data.replace('ADMIN_REMIND_SENT_', '');
      await handleAdminRemindConfirm(bot, token, chatId, orderId);
      return;
    }

    if (data.startsWith('ADMIN_REMIND_YES_')) {
      const orderId = data.replace('ADMIN_REMIND_YES_', '');
      await handleAdminRemindSent(bot, token, chatId, cq.message.message_id, orderId);
      return;
    }

    if (data.startsWith('ADMIN_REMIND_NO_')) {
      const orderId = data.replace('ADMIN_REMIND_NO_', '');
      await handleAdminRemindCancelled(token, chatId, cq.message.message_id, orderId);
      return;
    }

    // ── Manual payment review decisions ──
    if (data.startsWith('ADMIN_ORDER_ACCEPT_')) {
      const orderId = data.replace('ADMIN_ORDER_ACCEPT_', '');
      await handleAdminPaymentDecision(bot, token, chatId, cq.message.message_id, orderId, true, adminLabel(cq.from));
      return;
    }

    if (data.startsWith('ADMIN_ORDER_REJECT_')) {
      const orderId = data.replace('ADMIN_ORDER_REJECT_', '');
      await handleAdminPaymentDecision(bot, token, chatId, cq.message.message_id, orderId, false, adminLabel(cq.from));
      return;
    }

    if (data === 'ADMIN_PAYMENT_DECISION_DONE_NOOP') {
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
  receiptPhotoUrl?: string | null,
  needsReview: boolean = true
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

  const reviewLine = needsReview ? `\n\n⏳ *Waiting for your review — Accept / Reject:*` : '';

  const msg =
    `🔔 *New Order Received!*\n\n` +
    `🆔 #${order.id.slice(-6).toUpperCase()}\n` +
    `👤 ${order.customerName || '-'}\n` +
    `📧 ${order.customerEmail || '-'}\n` +
    `📱 ${order.customerPhone || '-'}\n` +
    townshipLine +
    `\n📦 *Items:*\n${items}\n\n` +
    `💵 *Total: ${order.total.toLocaleString()} Ks*\n` +
    `💳 ${order.paymentMethod || 'N/A'}` +
    reviewLine;

  const replyMarkup = needsReview
    ? {
        inline_keyboard: [
          [
            { text: '✅ Accepted', callback_data: `ADMIN_ORDER_ACCEPT_${order.id}` },
            { text: '❌ Rejected', callback_data: `ADMIN_ORDER_REJECT_${order.id}` },
          ],
        ],
      }
    : {
        inline_keyboard: [
          [
            {
              text: '📧 Ebook ပို့ပြီးကြောင်း Remind မည်',
              callback_data: `ADMIN_REMIND_SENT_${order.id}`,
            },
          ],
        ],
      };

  // Notify all whitelisted admins (and remember message IDs for button sync)
  const noticeRefs: { chatId: string; messageId: number }[] = [];
  await Promise.allSettled(
    bot.adminTelegramIds.map(async adminChatId => {
      const sentMsg = await sendTelegramMessage(bot.adminBotToken!, adminChatId, msg, replyMarkup);
      const messageId = sentMsg?.result?.message_id;
      if (typeof messageId === 'number') {
        noticeRefs.push({ chatId: String(adminChatId), messageId });
      }
      if (receiptPhotoUrl) {
        const sent = await sendTelegramPhotoFromUrl(
          bot.adminBotToken!,
          adminChatId,
          receiptPhotoUrl,
          `🧾 Receipt for #${order.id.slice(-6).toUpperCase()}`
        );
        if (!sent && needsReview) {
          // Photo forward failed — admin can still review via dashboard / resend
          await sendTelegramMessage(
            bot.adminBotToken!,
            adminChatId,
            `⚠️ Receipt photo for #${order.id.slice(-6).toUpperCase()} could not be forwarded. Please check the dashboard Orders page or ask the customer to resend.`
          );
        }
      } else if (needsReview) {
        await sendTelegramMessage(
          bot.adminBotToken!,
          adminChatId,
          `⚠️ No receipt image for #${order.id.slice(-6).toUpperCase()} (download failed). Please check the dashboard Orders page or ask the customer to resend the screenshot.`
        );
      }
    })
  );

  // Persist refs (append, cap at 20) so Accept/Reject syncs across all admins
  if (noticeRefs.length > 0) {
    try {
      const current = await prisma.order.findUnique({
        where: { id: order.id },
        select: { adminNoticeIds: true },
      });
      const prev = Array.isArray(current?.adminNoticeIds)
        ? (current.adminNoticeIds as { chatId: string; messageId: number }[])
        : [];
      const merged = [...prev, ...noticeRefs].slice(-20);
      await prisma.order.update({
        where: { id: order.id },
        data: { adminNoticeIds: merged },
      });
    } catch (err) {
      console.error('Failed to persist admin notice refs:', err);
    }
  }
}

/**
 * Notify admins that the customer cancelled a pending review order
 * (so nobody accepts an orphaned order).
 */
export async function notifyAdminOrderCancelled(
  bot: AdminBot,
  order: { id: string; customerName?: string | null }
) {
  if (!bot.adminBotToken || !bot.adminTelegramIds?.length) return;
  const msg =
    `🚫 *Order Cancelled by Customer*\n\n` +
    `🆔 #${order.id.slice(-6).toUpperCase()}\n` +
    `👤 ${order.customerName || '-'}\n\n` +
    `No action needed — this order was auto-cancelled.`;
  await Promise.allSettled(
    bot.adminTelegramIds.map(adminChatId =>
      sendTelegramMessage(bot.adminBotToken!, adminChatId, msg)
    )
  );
}

/**
 * Handle admin Accept / Reject on a pending payment-review order.
 * Idempotent: double-taps or late taps after cancel are safe no-ops.
 */
async function handleAdminPaymentDecision(
  bot: AdminBot,
  token: string,
  chatId: string,
  messageId: number,
  orderId: string,
  accepted: boolean,
  decider: string
) {
  const doneMarkup = (label: string) => ({
    inline_keyboard: [[{ text: label, callback_data: 'ADMIN_PAYMENT_DECISION_DONE_NOOP' }]],
  });

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { bot: true },
    });

    if (!order) {
      await sendTelegramMessage(token, chatId, '❌ Order ရှာမတွေ့ပါ။');
      return;
    }

    // ── Idempotency: already decided or gone ──
    // (`rejected` stays actionable — admin may still accept, or reject again)
    if (order.status !== 'pending' && order.status !== 'rejected') {
      const stateLabel =
        order.status === 'confirmed'
          ? '✅ လက်ခံပြီးသား order ဖြစ်ပါတယ်'
          : order.status === 'cancelled'
            ? '🚫 ပယ်ဖျက်ပြီးသား order ဖြစ်ပါတယ် (customer cancel / admin cancel)'
            : `ℹ️ Order status: ${order.status} (already handled)`;
      await sendTelegramMessage(token, chatId, stateLabel);
      await editTelegramMessageReplyMarkup(token, chatId, messageId, doneMarkup(stateLabel));
      // Still sync other admins' stale buttons to the same done state
      await syncAdminDecisionMarkup(bot, order.adminNoticeIds, stateLabel);
      return;
    }

    const shortId = `#${order.id.slice(-6).toUpperCase()}`;

    if (accepted) {
      // ── Stock check + decrement ──
      // Classic items carry productId; agentic items carry only {name, qty},
      // so resolve those by exact product-name match first.
      const items: any[] = Array.isArray(order.items) ? (order.items as any[]) : [];
      const stockItems = items.filter(i => i?.productId);
      const namelessItems = items.filter(i => i?.name && !i?.productId);
      if (namelessItems.length > 0 && (order.bot.botType === 'ecommerce' || !order.bot.botType)) {
        try {
          const products = await prisma.product.findMany({
            where: { botId: order.botId, isActive: true },
            select: { id: true, name: true },
          });
          const byName = new Map(products.map(p => [p.name.trim().toLowerCase(), p.id]));
          for (const item of namelessItems) {
            const matchedId = byName.get(String(item.name).trim().toLowerCase());
            if (matchedId) {
              item.productId = matchedId;
              stockItems.push(item);
            } else {
              console.warn(`[AdminReview] stock skip — no product match for "${item.name}" (order ${order.id})`);
            }
          }
        } catch (err) {
          console.error('[AdminReview] product name resolution failed:', err);
        }
      }
      if (stockItems.length > 0 && (order.bot.botType === 'ecommerce' || !order.bot.botType)) {
        try {
          await prisma.$transaction(async tx => {
            for (const item of stockItems) {
              const product = await tx.product.findUnique({ where: { id: item.productId } });
              if (!product || product.stockCount < (item.qty || 1)) {
                throw new Error(item.name || 'item');
              }
            }
            for (const item of stockItems) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stockCount: { decrement: item.qty || 1 } },
              });
            }
          });
        } catch {
          await sendTelegramMessage(
            token,
            chatId,
            `⚠️ ${shortId} — Stock မလောက်တော့ပါ။ Customer ကို ဆက်သွယ်ပြီး refund / alternative ညှိပေးပါ။`
          );
          await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
          await editTelegramMessageReplyMarkup(
            token, chatId, messageId, doneMarkup('⚠️ Stock မလောက် — Cancelled')
          );
          await syncAdminDecisionMarkup(bot, order.adminNoticeIds, '⚠️ Stock မလောက် — Cancelled');
          return;
        }
      }

      await prisma.order.update({ where: { id: order.id }, data: { status: 'confirmed' } });

      // ── Slow tail: Google Sheets sync + stock deduct (runs after response) ──
      const sheetBot = order.bot;
      const sheetItems = items
        .filter(i => i?.name)
        .map(i => ({ name: String(i.name), qty: Number(i.qty) || 1 }));
      after(async () => {
        if (sheetBot.googleSheetId) {
          try {
            const synced = await syncOrderToSheet(
              sheetBot.googleSheetId,
              sheetBot.googleSheetName || 'Orders',
              order as any
            );
            if (synced) {
              await prisma.order.update({ where: { id: order.id }, data: { sheetSynced: true } });
            }
            if (sheetItems.length > 0) {
              await deductStockInSheet(
                sheetBot.googleSheetId,
                sheetBot.googleSheetProductTab || 'Products',
                sheetItems
              ).catch(err => console.error('Sheets stock deduction failed:', err));
            }
          } catch (err) {
            console.error('Sheets order sync failed:', err);
          }
        }
        // ── Multi-admin sync: update every admin's buttons ──
        await syncAdminDecisionMarkup(bot, order.adminNoticeIds, `✅ ${shortId} Accepted by ${decider}`);
      });

      // ── Customer notify-back ──
      await notifyCustomer(order, MSG_PAYMENT_ACCEPTED(order.customerEmail));

      // ── Clear pending link so the customer can order again ──
      await clearCustomerPendingLink(order);

      await editTelegramMessageReplyMarkup(
        token, chatId, messageId, doneMarkup(`✅ ${shortId} Accepted by ${decider}`)
      );
      await sendTelegramMessage(
        token,
        chatId,
        `✅ Order *${shortId}* Accepted — customer ကို အကြောင်းကြားပြီးပါပြီ။`,
        {
          inline_keyboard: [
            [
              {
                text: '📧 Ebook ပို့ပြီးကြောင်း Remind မည်',
                callback_data: `ADMIN_REMIND_SENT_${order.id}`,
              },
            ],
          ],
        }
      );
    } else {
      // ── Rejected: mark for resend, keep order actionable, ask customer to resend ──
      await prisma.order.update({ where: { id: order.id }, data: { status: 'rejected' } });
      await notifyCustomer(order, MSG_PAYMENT_REJECTED);
      await resetCustomerToResend(order);
      await editTelegramMessageReplyMarkup(
        token, chatId, messageId, doneMarkup(`❌ ${shortId} Rejected by ${decider} — resend requested`)
      );
      after(() =>
        syncAdminDecisionMarkup(bot, order.adminNoticeIds, `❌ ${shortId} Rejected by ${decider}`)
      );
      await sendTelegramMessage(
        token,
        chatId,
        `❌ Order *${shortId}* Rejected — customer ကို screenshot ပြန်ပို့ဖို့ အကြောင်းကြားပြီးပါပြီ။`
      );
    }
  } catch (error) {
    console.error('Error in handleAdminPaymentDecision:', error);
    await sendTelegramMessage(token, chatId, '⚠️ Decision မှတ်ရာတွင် အမှားတစ်ခု ရှိသွားပါသည်။');
  }
}

/** Send a message back to the ordering customer on their platform. */
async function notifyCustomer(order: any, text: string) {
  try {
    if (order.platform === 'telegram' && order.bot.telegramBotToken && order.telegramChatId) {
      await sendTelegramMessage(order.bot.telegramBotToken, order.telegramChatId, text);
    } else if (order.platform === 'messenger' && order.bot.messengerPageToken && order.messengerSenderId) {
      await sendMessengerMessage(order.bot.messengerPageToken, order.messengerSenderId, text);
    }
  } catch (err) {
    console.error('Customer notify-back failed:', err);
  }
}

/** Remove the pendingOrderId link from the customer's sale session (order resolved). */
async function clearCustomerPendingLink(order: any) {
  try {
    if (order.platform === 'telegram' && order.telegramChatId) {
      const session = await prisma.telegramSaleSession.findUnique({
        where: { botId_telegramChatId: { botId: order.botId, telegramChatId: order.telegramChatId } },
      });
      if (session && (session.pendingData as any)?.pendingOrderId === order.id) {
        await prisma.telegramSaleSession.update({
          where: { id: session.id },
          data: {
            state: 'browsing',
            pendingData: { ...((session.pendingData as any) || {}), pendingOrderId: null },
          },
        });
      }
    }
  } catch (err) {
    console.error('clearCustomerPendingLink failed:', err);
  }
}

/**
 * Put the customer back into the slip-collection state so a resend replaces
 * the receipt on the SAME pending order.
 */
async function resetCustomerToResend(order: any) {
  try {
    if (order.platform === 'telegram' && order.telegramChatId) {
      const session = await prisma.telegramSaleSession.findUnique({
        where: { botId_telegramChatId: { botId: order.botId, telegramChatId: order.telegramChatId } },
      });
      const collectingState =
        order.bot.botCategory === 'telegram_agentic_sale'
          ? 'awaiting_payment_slip'
          : 'collecting_payment_screenshot';
      if (session) {
        await prisma.telegramSaleSession.update({
          where: { id: session.id },
          data: {
            state: collectingState,
            pendingData: { ...((session.pendingData as any) || {}), pendingOrderId: order.id },
          },
        });
      }
    }
  } catch (err) {
    console.error('resetCustomerToResend failed:', err);
  }
}

/**
 * Step 1 of the 2-tap remind: ask for confirmation before marking delivered.
 * The original Remind button stays live — NO only dismisses this dialog.
 */
async function handleAdminRemindConfirm(
  bot: AdminBot,
  token: string,
  chatId: string,
  orderId: string
) {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      await sendTelegramMessage(token, chatId, '❌ Order ရှာမတွေ့ပါ။');
      return;
    }

    if (order.status === 'delivered') {
      await sendTelegramMessage(token, chatId, '⚠️ ဤ Order သည် ပို့ပြီးသားဖြစ်နေပါသည် (သို့မဟုတ်) Remind လုပ်ပြီးသားဖြစ်နေပါသည်။');
      return;
    }

    const shortId = `#${order.id.slice(-6).toUpperCase()}`;
    await sendTelegramMessage(
      token,
      chatId,
      `📧 *Order ${shortId} — Ebook တကယ်ပို့ပြီးပြီလား?*\n\n` +
        `👤 ${order.customerName || '-'}\n` +
        `📧 ${order.customerEmail || '-'}\n\n` +
        `Email နဲ့ Ebook ပို့ပြီးမှ "ပို့ပြီးပြီ" ကို နှိပ်ပါ။`,
      {
        inline_keyboard: [
          [
            { text: '✅ ပို့ပြီးပြီ, Remind ပို့မယ်', callback_data: `ADMIN_REMIND_YES_${order.id}` },
            { text: '❌ မပို့ရသေးဘူး', callback_data: `ADMIN_REMIND_NO_${order.id}` },
          ],
        ],
      }
    );
  } catch (error) {
    console.error('Error in handleAdminRemindConfirm:', error);
    await sendTelegramMessage(token, chatId, '⚠️ Remind လုပ်ရာတွင် အမှားအယွင်းတစ်ခု ရှိသွားပါသည်။');
  }
}

/**
 * Admin tapped "not sent yet" — dismiss the confirm dialog, change nothing.
 * Order stays `confirmed`; the original Remind button remains usable.
 * NOTE: plain text only, no inline button (a button here invites mis-taps).
 */
async function handleAdminRemindCancelled(
  token: string,
  chatId: string,
  messageId: number,
  orderId: string
) {
  // Strip the YES/NO buttons so the dialog can't be tapped twice
  await editTelegramMessageReplyMarkup(token, chatId, messageId, { inline_keyboard: [] });
  await sendTelegramMessage(
    token,
    chatId,
    `🚫 Order \`#${orderId.slice(-6).toUpperCase()}\` — ဘာမှမလုပ်ပါ။ Ebook ကို email နဲ့ ပို့ပြီးမှ Remind button ကို ပြန်နှိပ်ပါ။`
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
