import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';

type TBot = any;

const PAGE_SIZE = 5;

// ─── List orders (paginated + filterable by status) ───────────────────────────

async function sendOrderList(
  bot: TBot,
  token: string,
  chatId: string,
  page: number = 0,
  statusFilter?: string
) {
  const where: any = { botId: bot.id };
  if (statusFilter) where.status = statusFilter;

  const total = await prisma.order.count({ where });
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  if (total === 0) {
    const filterText = statusFilter ? ` (${statusFilter})` : '';
    await sendTelegramMessage(token, chatId, `📋 Order${filterText} မရှိပါ`, {
      inline_keyboard: [
        [{ text: '📋 All Orders', callback_data: 'ADMIN_ORDERS' }],
        [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
      ],
    });
    return;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const filterLabel = statusFilter ? ` — ${statusFilter}` : '';
  let msg = `📋 *Orders*${filterLabel} (${total} total) — Page ${page + 1}/${totalPages}\n\n`;

  orders.forEach((o, i) => {
    const idx = page * PAGE_SIZE + i + 1;
    const statusEmoji: Record<string, string> = {
      pending: '🟡',
      confirmed: '🟢',
      cancelled: '🔴',
      delivered: '✅',
      shipped: '📦',
    };
    const emoji = statusEmoji[o.status] || '⚪';
    const date = new Date(o.createdAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Yangon' });
    const items = Array.isArray(o.items)
      ? (o.items as any[]).map((i: any) => `${i.name}×${i.qty || 1}`).join(', ')
      : String(o.items);

    msg +=
      `${idx}. ${emoji} *#${o.id.slice(-6).toUpperCase()}*\n` +
      `   👤 ${o.customerName || '-'} | 📱 ${o.customerPhone || '-'}\n` +
      `   📦 ${items.substring(0, 60)}\n` +
      `   💰 ${o.total.toLocaleString()} Ks | 📅 ${date}\n\n`;
  });

  // Order detail buttons
  const orderRows = orders.map(o => [
    { text: `👁 #${o.id.slice(-6).toUpperCase()}`, callback_data: `AORDER_VIEW_${o.id}` },
    { text: statusLabel(o.status), callback_data: `AORDER_STATUS_${o.id}` },
  ]);

  // Navigation
  const navRow: { text: string; callback_data: string }[] = [];
  const filterSuffix = statusFilter ? `_F_${statusFilter}` : '';
  if (page > 0) navRow.push({ text: '◀ Prev', callback_data: `AORDER_PAGE_${page - 1}${filterSuffix}` });
  navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'AORDER_NOOP' });
  if (page < totalPages - 1) navRow.push({ text: 'Next ▶', callback_data: `AORDER_PAGE_${page + 1}${filterSuffix}` });

  // Filter row
  const filterRow = [
    { text: '🟡 Pending', callback_data: 'AORDER_FILTER_pending' },
    { text: '🟢 Confirmed', callback_data: 'AORDER_FILTER_confirmed' },
    { text: '✅ Delivered', callback_data: 'AORDER_FILTER_delivered' },
  ];

  await sendTelegramMessage(token, chatId, msg, {
    inline_keyboard: [
      ...orderRows,
      navRow,
      filterRow,
      [
        { text: '📋 All', callback_data: 'ADMIN_ORDERS' },
        { text: '🏠 Menu', callback_data: 'ADMIN_MENU' },
      ],
    ],
  });
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '🟡 Pending',
    confirmed: '🟢 Confirmed',
    shipped: '📦 Shipped',
    delivered: '✅ Delivered',
    cancelled: '🔴 Cancelled',
  };
  return labels[status] || status;
}

// ─── Command: /orders ─────────────────────────────────────────────────────────

export async function handleOrderCommand(bot: TBot, token: string, chatId: string, text: string) {
  const parts = text.split(/\s+/);
  const statusFilter = parts[1]; // /orders pending
  await sendOrderList(bot, token, chatId, 0, statusFilter);
}

// ─── Callback handler ─────────────────────────────────────────────────────────

export async function handleOrderCallback(bot: TBot, token: string, chatId: string, data: string) {
  if (data === 'ADMIN_ORDERS') {
    await sendOrderList(bot, token, chatId, 0);
    return;
  }

  if (data === 'AORDER_NOOP') return;

  // Pagination
  if (data.startsWith('AORDER_PAGE_')) {
    const rest = data.replace('AORDER_PAGE_', '');
    // Check for filter suffix: AORDER_PAGE_2_F_pending
    const filterMatch = rest.match(/^(\d+)_F_(.+)$/);
    if (filterMatch) {
      await sendOrderList(bot, token, chatId, parseInt(filterMatch[1], 10), filterMatch[2]);
    } else {
      await sendOrderList(bot, token, chatId, parseInt(rest, 10));
    }
    return;
  }

  // Filter
  if (data.startsWith('AORDER_FILTER_')) {
    const status = data.replace('AORDER_FILTER_', '');
    await sendOrderList(bot, token, chatId, 0, status);
    return;
  }

  // View order detail
  if (data.startsWith('AORDER_VIEW_')) {
    const orderId = data.replace('AORDER_VIEW_', '');
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      await sendTelegramMessage(token, chatId, '❌ Order ရှာမတွေ့ပါ');
      return;
    }

    const items = Array.isArray(order.items)
      ? (order.items as any[]).map((i: any) => `  • ${i.name} × ${i.qty || 1}`).join('\n')
      : String(order.items);

    const date = new Date(order.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' });

    const msg =
      `📋 *Order #${order.id.slice(-6).toUpperCase()}*\n\n` +
      `📅 Date: ${date}\n` +
      `📱 Platform: ${order.platform}\n` +
      `${statusLabel(order.status)}\n\n` +
      `👤 *Customer*\n` +
      `  အမည်: ${order.customerName || '-'}\n` +
      `  ဖုန်း: ${order.customerPhone || '-'}\n` +
      `  လိပ်စာ: ${order.customerAddress || '-'}\n` +
      `  မြို့နယ်: ${order.customerTownship || '-'}\n\n` +
      `📦 *Items*\n${items}\n\n` +
      `💰 Subtotal: ${order.subtotal.toLocaleString()} Ks\n` +
      `🚚 Delivery: ${order.deliveryFee.toLocaleString()} Ks\n` +
      `💵 *Total: ${order.total.toLocaleString()} Ks*\n` +
      `💳 Payment: ${order.paymentMethod || '-'}`;

    await sendTelegramMessage(token, chatId, msg, {
      inline_keyboard: [
        [{ text: '🔄 Status ပြောင်းမည်', callback_data: `AORDER_STATUS_${order.id}` }],
        [{ text: '◀ Orders', callback_data: 'ADMIN_ORDERS' }],
      ],
    });
    return;
  }

  // Status change menu
  if (data.startsWith('AORDER_STATUS_') && !data.startsWith('AORDER_STATUS_SET_')) {
    const orderId = data.replace('AORDER_STATUS_', '');
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      await sendTelegramMessage(token, chatId, '❌ Order ရှာမတွေ့ပါ');
      return;
    }

    await sendTelegramMessage(token, chatId,
      `🔄 *#${order.id.slice(-6).toUpperCase()}* — Status ပြောင်းမည်\n\nလက်ရှိ: ${statusLabel(order.status)}`,
      {
        inline_keyboard: [
          [
            { text: '🟡 Pending', callback_data: `AORDER_STATUS_SET_pending_${orderId}` },
            { text: '🟢 Confirmed', callback_data: `AORDER_STATUS_SET_confirmed_${orderId}` },
          ],
          [
            { text: '📦 Shipped', callback_data: `AORDER_STATUS_SET_shipped_${orderId}` },
            { text: '✅ Delivered', callback_data: `AORDER_STATUS_SET_delivered_${orderId}` },
          ],
          [
            { text: '🔴 Cancelled', callback_data: `AORDER_STATUS_SET_cancelled_${orderId}` },
          ],
          [{ text: '◀ ပြန်မည်', callback_data: `AORDER_VIEW_${orderId}` }],
        ],
      }
    );
    return;
  }

  // Status set
  if (data.startsWith('AORDER_STATUS_SET_')) {
    const rest = data.replace('AORDER_STATUS_SET_', '');
    const underscoreIdx = rest.indexOf('_');
    const newStatus = rest.substring(0, underscoreIdx);
    const orderId = rest.substring(underscoreIdx + 1);

    try {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: newStatus },
      });
      await sendTelegramMessage(token, chatId,
        `✅ Order *#${orderId.slice(-6).toUpperCase()}* ကို ${statusLabel(newStatus)} သို့ ပြောင်းပြီးပါပြီ`,
        {
          inline_keyboard: [
            [{ text: '👁 Order ကြည့်မည်', callback_data: `AORDER_VIEW_${orderId}` }],
            [{ text: '📋 Orders', callback_data: 'ADMIN_ORDERS' }],
          ],
        }
      );
    } catch {
      await sendTelegramMessage(token, chatId, '❌ Status ပြောင်း၍ မရပါ');
    }
    return;
  }
}
