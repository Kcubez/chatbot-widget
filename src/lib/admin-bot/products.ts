import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';
import { updateAdminSession } from '@/lib/admin-bot';
import {
  readProductsFromSheet,
  appendProductToSheet,
  updateProductInSheet,
  deleteProductFromSheet,
  toggleProductInSheet,
} from '@/lib/sheets';

type TBot = any;
type Session = any;

const PAGE_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSheetMode(bot: TBot): boolean {
  return bot.inventorySource === 'google_sheet' && !!bot.googleSheetId;
}

async function getSession(botId: string, chatId: string) {
  return prisma.adminBotSession.upsert({
    where: { botId_telegramChatId: { botId, telegramChatId: chatId } },
    create: { botId, telegramChatId: chatId, state: 'idle' },
    update: {},
  });
}

// ─── List products (paginated) — works for both modes ─────────────────────────

async function sendProductList(bot: TBot, token: string, chatId: string, page: number = 0) {
  let allProducts: any[] = [];

  if (isSheetMode(bot)) {
    allProducts = await readProductsFromSheet(bot.googleSheetId, bot.googleSheetProductTab || 'Products');
  } else {
    allProducts = await prisma.product.findMany({
      where: { botId: bot.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  const total = allProducts.length;

  if (total === 0) {
    await sendTelegramMessage(token, chatId, '📦 ပစ္စည်းမရှိသေးပါ။', {
      inline_keyboard: [
        [{ text: '➕ ပစ္စည်းအသစ်ထည့်မည်', callback_data: 'APROD_ADD' }],
        [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
      ],
    });
    return;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const products = allProducts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const modeLabel = isSheetMode(bot) ? '📊 Sheet' : '🗄 DB';
  let msg = `📦 *Products* (${total}) ${modeLabel} — Page ${page + 1}/${totalPages}\n\n`;

  products.forEach((p: any, i: number) => {
    const idx = page * PAGE_SIZE + i + 1;
    const status = (p.isActive !== false && p.stockCount > 0) ? '🟢' : '🔴';
    msg += `${idx}. ${status} *${p.name}* — ${(p.price || 0).toLocaleString()} Ks (Stock: ${p.stockCount})\n`;
  });

  // For Sheet mode, use name-based IDs; for DB, use prisma IDs
  const productRows = products.map((p: any) => {
    const id = isSheetMode(bot) ? encodeURIComponent(p.name) : p.id;
    return [
      { text: `✏️ ${p.name.substring(0, 15)}`, callback_data: `APROD_EDIT_${id}` },
      { text: '🗑', callback_data: `APROD_DEL_${id}` },
      {
        text: (p.isActive !== false && p.stockCount > 0) ? '🔴 Off' : '🟢 On',
        callback_data: `APROD_TOGGLE_${id}`,
      },
    ];
  });

  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: '◀ Prev', callback_data: `APROD_PAGE_${page - 1}` });
  navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'APROD_NOOP' });
  if (page < totalPages - 1) navRow.push({ text: 'Next ▶', callback_data: `APROD_PAGE_${page + 1}` });

  await sendTelegramMessage(token, chatId, msg, {
    inline_keyboard: [
      ...productRows,
      navRow,
      [{ text: '➕ ပစ္စည်းအသစ်ထည့်မည်', callback_data: 'APROD_ADD' }],
      [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
    ],
  });
}

// ─── Command: /products ───────────────────────────────────────────────────────

export async function handleProductCommand(bot: TBot, token: string, chatId: string) {
  await sendProductList(bot, token, chatId, 0);
}

// ─── Callback handler ─────────────────────────────────────────────────────────

export async function handleProductCallback(bot: TBot, token: string, chatId: string, data: string) {
  if (data === 'ADMIN_PRODUCTS') {
    await sendProductList(bot, token, chatId, 0);
    return;
  }

  if (data.startsWith('APROD_PAGE_')) {
    const page = parseInt(data.replace('APROD_PAGE_', ''), 10);
    await sendProductList(bot, token, chatId, page);
    return;
  }

  if (data === 'APROD_NOOP') return;

  // ── Save new product ──
  if (data === 'APROD_ADD_SAVE') {
    await handleProductSaveCallback(bot, token, chatId);
    return;
  }

  // ── Add product flow ──
  if (data === 'APROD_ADD') {
    const session = await getSession(bot.id, chatId);
    await updateAdminSession(session.id, {
      state: 'adding_product_name',
      pendingData: {},
    });
    await sendTelegramMessage(token, chatId,
      '➕ *ပစ္စည်းအသစ်ထည့်မည်*\n\nပစ္စည်းအမည် ရိုက်ထည့်ပါ:\n\n/cancel ရိုက်၍ ပယ်ဖျက်နိုင်ပါတယ်'
    );
    return;
  }

  // ── Toggle active ──
  if (data.startsWith('APROD_TOGGLE_')) {
    const idOrName = data.replace('APROD_TOGGLE_', '');

    if (isSheetMode(bot)) {
      const name = decodeURIComponent(idOrName);
      // Read current stock to determine toggle direction
      const products = await readProductsFromSheet(bot.googleSheetId, bot.googleSheetProductTab || 'Products');
      const product = products.find(p => p.name.toLowerCase() === name.toLowerCase());
      const isCurrentlyActive = product ? product.stockCount > 0 : true;

      await toggleProductInSheet(bot.googleSheetId, name, !isCurrentlyActive, bot.googleSheetProductTab || 'Products');
      await sendTelegramMessage(token, chatId,
        `${isCurrentlyActive ? '🔴' : '🟢'} *${name}* ကို ${isCurrentlyActive ? 'ပိတ်' : 'ဖွင့်'}ပြီးပါပြီ`
      );
    } else {
      const product = await prisma.product.findUnique({ where: { id: idOrName } });
      if (product) {
        await prisma.product.update({
          where: { id: idOrName },
          data: { isActive: !product.isActive },
        });
        await sendTelegramMessage(token, chatId,
          `${product.isActive ? '🔴' : '🟢'} *${product.name}* ကို ${product.isActive ? 'ပိတ်' : 'ဖွင့်'}ပြီးပါပြီ`
        );
      }
    }
    await sendProductList(bot, token, chatId, 0);
    return;
  }

  // ── Delete confirm ──
  if (data.startsWith('APROD_DEL_') && !data.startsWith('APROD_DEL_CONFIRM_')) {
    const idOrName = data.replace('APROD_DEL_', '');
    let productName: string;

    if (isSheetMode(bot)) {
      productName = decodeURIComponent(idOrName);
    } else {
      const product = await prisma.product.findUnique({ where: { id: idOrName } });
      if (!product) {
        await sendTelegramMessage(token, chatId, '❌ ပစ္စည်းရှာမတွေ့ပါ');
        return;
      }
      productName = product.name;
    }

    await sendTelegramMessage(token, chatId,
      `🗑 *${productName}* ကို ဖျက်ချင်တာ သေချာပါသလား?`,
      {
        inline_keyboard: [
          [
            { text: '✅ ဖျက်မည်', callback_data: `APROD_DEL_CONFIRM_${idOrName}` },
            { text: '❌ မဖျက်ပါ', callback_data: 'ADMIN_PRODUCTS' },
          ],
        ],
      }
    );
    return;
  }

  // ── Delete confirmed ──
  if (data.startsWith('APROD_DEL_CONFIRM_')) {
    const idOrName = data.replace('APROD_DEL_CONFIRM_', '');

    try {
      if (isSheetMode(bot)) {
        const name = decodeURIComponent(idOrName);
        await deleteProductFromSheet(bot.googleSheetId, name, bot.googleSheetProductTab || 'Products');
      } else {
        await prisma.product.delete({ where: { id: idOrName } });
      }
      await sendTelegramMessage(token, chatId, '✅ ဖျက်ပြီးပါပြီ');
    } catch {
      await sendTelegramMessage(token, chatId, '❌ ဖျက်၍မရပါ');
    }
    await sendProductList(bot, token, chatId, 0);
    return;
  }

  // ── Edit product ──
  if (data.startsWith('APROD_EDIT_') && !data.startsWith('APROD_EDIT_FIELD_')) {
    const idOrName = data.replace('APROD_EDIT_', '');
    let product: any;

    if (isSheetMode(bot)) {
      const name = decodeURIComponent(idOrName);
      const products = await readProductsFromSheet(bot.googleSheetId, bot.googleSheetProductTab || 'Products');
      product = products.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!product) {
        await sendTelegramMessage(token, chatId, '❌ ပစ္စည်းရှာမတွေ့ပါ');
        return;
      }
    } else {
      product = await prisma.product.findUnique({ where: { id: idOrName } });
      if (!product) {
        await sendTelegramMessage(token, chatId, '❌ ပစ္စည်းရှာမတွေ့ပါ');
        return;
      }
    }

    const msg =
      `✏️ *${product.name}* ပြင်ဆင်မည်\n\n` +
      `📦 အမည်: ${product.name}\n` +
      `💰 ဈေးနှုန်း: ${(product.price || 0).toLocaleString()} Ks\n` +
      `📊 Stock: ${product.stockCount}\n` +
      `📂 Category: ${product.category}\n` +
      `📝 Description: ${product.description || '-'}\n` +
      `🖼 Image: ${product.image ? 'Yes' : 'No'}\n\n` +
      `ဘာပြင်ချင်ပါသလဲ?`;

    await sendTelegramMessage(token, chatId, msg, {
      inline_keyboard: [
        [
          { text: '📦 အမည်', callback_data: `APROD_EDIT_FIELD_name_${idOrName}` },
          { text: '💰 ဈေးနှုန်း', callback_data: `APROD_EDIT_FIELD_price_${idOrName}` },
        ],
        [
          { text: '📊 Stock', callback_data: `APROD_EDIT_FIELD_stockCount_${idOrName}` },
          { text: '📂 Category', callback_data: `APROD_EDIT_FIELD_category_${idOrName}` },
        ],
        [
          { text: '📝 Description', callback_data: `APROD_EDIT_FIELD_description_${idOrName}` },
          { text: '🖼 Image URL', callback_data: `APROD_EDIT_FIELD_image_${idOrName}` },
        ],
        [{ text: '◀ ပစ္စည်းများ', callback_data: 'ADMIN_PRODUCTS' }],
      ],
    });
    return;
  }

  // ── Edit field selected ──
  if (data.startsWith('APROD_EDIT_FIELD_')) {
    const rest = data.replace('APROD_EDIT_FIELD_', '');
    const underscoreIdx = rest.indexOf('_');
    const field = rest.substring(0, underscoreIdx);
    const idOrName = rest.substring(underscoreIdx + 1);

    const fieldLabels: Record<string, string> = {
      name: '📦 အမည်အသစ်',
      price: '💰 ဈေးနှုန်းအသစ် (ဂဏန်းသာ)',
      stockCount: '📊 Stock အရေအတွက်အသစ်',
      category: '📂 Category အသစ်',
      description: '📝 Description အသစ်',
      image: '🖼 Image URL အသစ်',
    };

    // For Sheet mode, also store the product name for lookup
    let productName = '';
    if (isSheetMode(bot)) {
      productName = decodeURIComponent(idOrName);
    }

    const session = await getSession(bot.id, chatId);
    await updateAdminSession(session.id, {
      state: `editing_product_${field}`,
      pendingData: { productId: idOrName, field, productName },
    });

    await sendTelegramMessage(token, chatId,
      `${fieldLabels[field] || field} ရိုက်ထည့်ပါ:\n\n/cancel ရိုက်၍ ပယ်ဖျက်နိုင်ပါတယ်`
    );
    return;
  }
}

// ─── Text input handler (multi-step flows) ────────────────────────────────────

export async function handleProductTextInput(
  bot: TBot,
  token: string,
  chatId: string,
  text: string,
  session: Session
) {
  const pending = (session.pendingData as any) || {};

  // ── ADD PRODUCT FLOW ──

  if (session.state === 'adding_product_name') {
    pending.name = text;
    await updateAdminSession(session.id, { state: 'adding_product_price', pendingData: pending });
    await sendTelegramMessage(token, chatId, '💰 ဈေးနှုန်း (Ks) ရိုက်ထည့်ပါ:');
    return;
  }

  if (session.state === 'adding_product_price') {
    const price = parseFloat(text.replace(/,/g, ''));
    if (isNaN(price)) {
      await sendTelegramMessage(token, chatId, '⚠️ ဂဏန်းသာ ရိုက်ပေးပါ (ဥပမာ: 5000)');
      return;
    }
    pending.price = price;
    await updateAdminSession(session.id, { state: 'adding_product_stock', pendingData: pending });
    await sendTelegramMessage(token, chatId, '📊 Stock အရေအတွက် ရိုက်ထည့်ပါ:');
    return;
  }

  if (session.state === 'adding_product_stock') {
    const stock = parseInt(text.replace(/,/g, ''), 10);
    if (isNaN(stock)) {
      await sendTelegramMessage(token, chatId, '⚠️ ဂဏန်းသာ ရိုက်ပေးပါ (ဥပမာ: 100)');
      return;
    }
    pending.stockCount = stock;
    await updateAdminSession(session.id, { state: 'adding_product_category', pendingData: pending });
    await sendTelegramMessage(token, chatId, '📂 Category ရိုက်ထည့်ပါ (ဥပမာ: eBook, Stationery):');
    return;
  }

  if (session.state === 'adding_product_category') {
    pending.category = text;
    await updateAdminSession(session.id, { state: 'adding_product_image', pendingData: pending });
    await sendTelegramMessage(token, chatId, '🖼 Image URL ထည့်ပါ (မရှိရင် `skip` ရိုက်ပါ):');
    return;
  }

  if (session.state === 'adding_product_image') {
    if (text.toLowerCase() !== 'skip') pending.image = text;
    await updateAdminSession(session.id, { state: 'adding_product_description', pendingData: pending });
    await sendTelegramMessage(token, chatId, '📝 Description ရိုက်ထည့်ပါ (မရှိရင် `skip` ရိုက်ပါ):');
    return;
  }

  if (session.state === 'adding_product_description') {
    if (text.toLowerCase() !== 'skip') pending.description = text;

    const modeLabel = isSheetMode(bot) ? '📊 Google Sheet' : '🗄 Database';
    const msg =
      `✅ *အတည်ပြုမည်* (${modeLabel})\n\n` +
      `📦 ${pending.name}\n` +
      `💰 ${pending.price?.toLocaleString()} Ks\n` +
      `📊 Stock: ${pending.stockCount}\n` +
      `📂 ${pending.category}\n` +
      `🖼 ${pending.image || 'None'}\n` +
      `📝 ${pending.description || 'None'}`;

    await updateAdminSession(session.id, { state: 'adding_product_confirm', pendingData: pending });

    await sendTelegramMessage(token, chatId, msg, {
      inline_keyboard: [
        [
          { text: '✅ သိမ်းမည်', callback_data: 'APROD_ADD_SAVE' },
          { text: '❌ ပယ်ဖျက်', callback_data: 'ADMIN_PRODUCTS' },
        ],
      ],
    });
    return;
  }

  // ── EDIT PRODUCT FLOW ──

  if (session.state.startsWith('editing_product_')) {
    const field = pending.field;
    const productId = pending.productId;
    const productName = pending.productName || '';

    let value: any = text;
    if (field === 'price') {
      value = parseFloat(text.replace(/,/g, ''));
      if (isNaN(value)) {
        await sendTelegramMessage(token, chatId, '⚠️ ဂဏန်းသာ ရိုက်ပေးပါ');
        return;
      }
    }
    if (field === 'stockCount') {
      value = parseInt(text.replace(/,/g, ''), 10);
      if (isNaN(value)) {
        await sendTelegramMessage(token, chatId, '⚠️ ဂဏန်းသာ ရိုက်ပေးပါ');
        return;
      }
    }

    try {
      if (isSheetMode(bot)) {
        const name = productName || decodeURIComponent(productId);
        await updateProductInSheet(
          bot.googleSheetId,
          name,
          field,
          value,
          bot.googleSheetProductTab || 'Products'
        );
      } else {
        await prisma.product.update({
          where: { id: productId },
          data: { [field]: value },
        });
      }

      await updateAdminSession(session.id, { state: 'idle', pendingData: null });
      await sendTelegramMessage(token, chatId, `✅ *${field}* ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ`, {
        inline_keyboard: [
          [{ text: '📦 ပစ္စည်းများ', callback_data: 'ADMIN_PRODUCTS' }],
          [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
        ],
      });
    } catch {
      await sendTelegramMessage(token, chatId, '❌ ပြင်ဆင်၍ မရပါ');
    }
    return;
  }
}

// ─── Save product (from confirm callback) ────────────────────────────────────

async function handleProductSaveCallback(bot: TBot, token: string, chatId: string) {
  const session = await getSession(bot.id, chatId);
  const pending = (session.pendingData as any) || {};

  if (session.state !== 'adding_product_confirm' || !pending.name) {
    await sendTelegramMessage(token, chatId, '❌ ပစ္စည်းအချက်အလက် မပြည့်စုံပါ');
    return;
  }

  try {
    if (isSheetMode(bot)) {
      await appendProductToSheet(
        bot.googleSheetId,
        {
          name: pending.name,
          price: pending.price || 0,
          category: pending.category || 'General',
          stock: pending.stockCount || 0,
          image: pending.image || null,
          description: pending.description || null,
        },
        bot.googleSheetProductTab || 'Products'
      );
    } else {
      await prisma.product.create({
        data: {
          botId: bot.id,
          name: pending.name,
          price: pending.price || 0,
          stockCount: pending.stockCount || 0,
          category: pending.category || 'General',
          image: pending.image || null,
          description: pending.description || null,
        },
      });
    }

    await updateAdminSession(session.id, { state: 'idle', pendingData: null });
    const target = isSheetMode(bot) ? 'Google Sheet' : 'Database';
    await sendTelegramMessage(token, chatId,
      `✅ *${pending.name}* ကို ${target} ထဲသို့ အောင်မြင်စွာ ထည့်ပြီးပါပြီ!`,
      {
        inline_keyboard: [
          [{ text: '📦 ပစ္စည်းများ', callback_data: 'ADMIN_PRODUCTS' }],
          [{ text: '➕ နောက်ထပ်ထည့်မည်', callback_data: 'APROD_ADD' }],
          [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
        ],
      }
    );
  } catch (error) {
    console.error('Admin bot: product create error:', error);
    await sendTelegramMessage(token, chatId, '❌ ပစ္စည်းထည့်၍ မရပါ');
  }
}
