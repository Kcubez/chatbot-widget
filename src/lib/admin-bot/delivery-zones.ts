import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';
import { updateAdminSession } from '@/lib/admin-bot';
import {
  readDeliveryZonesFromSheet,
  appendZoneToSheet,
  updateZoneInSheet,
  deleteZoneFromSheet,
} from '@/lib/sheets';

type TBot = any;
type Session = any;

const PAGE_SIZE = 8;

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

// ─── List zones (paginated) ───────────────────────────────────────────────────

async function sendZoneList(bot: TBot, token: string, chatId: string, page: number = 0) {
  let allZones: any[] = [];

  if (isSheetMode(bot)) {
    allZones = await readDeliveryZonesFromSheet(bot.googleSheetId);
  } else {
    allZones = await prisma.deliveryZone.findMany({
      where: { botId: bot.id },
      orderBy: { township: 'asc' },
    });
  }

  const total = allZones.length;

  if (total === 0) {
    await sendTelegramMessage(token, chatId, '🚚 Delivery zone မရှိသေးပါ။', {
      inline_keyboard: [
        [{ text: '➕ Zone အသစ်ထည့်မည်', callback_data: 'AZONE_ADD' }],
        [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
      ],
    });
    return;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const zones = allZones.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const modeLabel = isSheetMode(bot) ? '📊 Sheet' : '🗄 DB';
  let msg = `🚚 *Delivery Zones* (${total}) ${modeLabel} — Page ${page + 1}/${totalPages}\n\n`;

  zones.forEach((z: any, i: number) => {
    const idx = page * PAGE_SIZE + i + 1;
    const status = z.isActive !== false ? '🟢' : '🔴';
    msg += `${idx}. ${status} *${z.township}*${z.city ? ` (${z.city})` : ''} — ${(z.fee || 0).toLocaleString()} Ks\n`;
  });

  const zoneRows = zones.map((z: any) => {
    const id = isSheetMode(bot) ? encodeURIComponent(z.township) : z.id;
    return [
      { text: `✏️ ${z.township.substring(0, 12)}`, callback_data: `AZONE_EDIT_${id}` },
      { text: '🗑', callback_data: `AZONE_DEL_${id}` },
    ];
  });

  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: '◀ Prev', callback_data: `AZONE_PAGE_${page - 1}` });
  navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'AZONE_NOOP' });
  if (page < totalPages - 1) navRow.push({ text: 'Next ▶', callback_data: `AZONE_PAGE_${page + 1}` });

  await sendTelegramMessage(token, chatId, msg, {
    inline_keyboard: [
      ...zoneRows,
      navRow,
      [{ text: '➕ Zone အသစ်ထည့်မည်', callback_data: 'AZONE_ADD' }],
      [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
    ],
  });
}

// ─── Command: /zones ──────────────────────────────────────────────────────────

export async function handleZoneCommand(bot: TBot, token: string, chatId: string) {
  await sendZoneList(bot, token, chatId, 0);
}

// ─── Callback handler ─────────────────────────────────────────────────────────

export async function handleZoneCallback(bot: TBot, token: string, chatId: string, data: string) {
  if (data === 'ADMIN_ZONES') {
    await sendZoneList(bot, token, chatId, 0);
    return;
  }

  if (data.startsWith('AZONE_PAGE_')) {
    const page = parseInt(data.replace('AZONE_PAGE_', ''), 10);
    await sendZoneList(bot, token, chatId, page);
    return;
  }

  if (data === 'AZONE_NOOP') return;

  // ── Add zone flow ──
  if (data === 'AZONE_ADD') {
    const session = await getSession(bot.id, chatId);
    await updateAdminSession(session.id, {
      state: 'adding_zone_township',
      pendingData: {},
    });
    await sendTelegramMessage(token, chatId,
      '➕ *Zone အသစ်ထည့်မည်*\n\nမြို့နယ်အမည် ရိုက်ထည့်ပါ:\n\n/cancel ရိုက်၍ ပယ်ဖျက်နိုင်ပါတယ်'
    );
    return;
  }

  // ── Delete confirm ──
  if (data.startsWith('AZONE_DEL_') && !data.startsWith('AZONE_DEL_CONFIRM_')) {
    const idOrName = data.replace('AZONE_DEL_', '');
    let zoneName: string;

    if (isSheetMode(bot)) {
      zoneName = decodeURIComponent(idOrName);
    } else {
      const zone = await prisma.deliveryZone.findUnique({ where: { id: idOrName } });
      if (!zone) {
        await sendTelegramMessage(token, chatId, '❌ Zone ရှာမတွေ့ပါ');
        return;
      }
      zoneName = zone.township;
    }

    await sendTelegramMessage(token, chatId,
      `🗑 *${zoneName}* ကို ဖျက်ချင်တာ သေချာပါသလား?`,
      {
        inline_keyboard: [
          [
            { text: '✅ ဖျက်မည်', callback_data: `AZONE_DEL_CONFIRM_${idOrName}` },
            { text: '❌ မဖျက်ပါ', callback_data: 'ADMIN_ZONES' },
          ],
        ],
      }
    );
    return;
  }

  // ── Delete confirmed ──
  if (data.startsWith('AZONE_DEL_CONFIRM_')) {
    const idOrName = data.replace('AZONE_DEL_CONFIRM_', '');

    try {
      if (isSheetMode(bot)) {
        const name = decodeURIComponent(idOrName);
        await deleteZoneFromSheet(bot.googleSheetId, name);
      } else {
        await prisma.deliveryZone.delete({ where: { id: idOrName } });
      }
      await sendTelegramMessage(token, chatId, '✅ ဖျက်ပြီးပါပြီ');
    } catch {
      await sendTelegramMessage(token, chatId, '❌ ဖျက်၍မရပါ');
    }
    await sendZoneList(bot, token, chatId, 0);
    return;
  }

  // ── Edit zone ──
  if (data.startsWith('AZONE_EDIT_') && !data.startsWith('AZONE_EDIT_FIELD_')) {
    const idOrName = data.replace('AZONE_EDIT_', '');
    let zone: any;

    if (isSheetMode(bot)) {
      const name = decodeURIComponent(idOrName);
      const zones = await readDeliveryZonesFromSheet(bot.googleSheetId);
      zone = zones.find(z => z.township.toLowerCase() === name.toLowerCase());
      if (!zone) {
        await sendTelegramMessage(token, chatId, '❌ Zone ရှာမတွေ့ပါ');
        return;
      }
    } else {
      zone = await prisma.deliveryZone.findUnique({ where: { id: idOrName } });
      if (!zone) {
        await sendTelegramMessage(token, chatId, '❌ Zone ရှာမတွေ့ပါ');
        return;
      }
    }

    await sendTelegramMessage(token, chatId,
      `✏️ *${zone.township}* ပြင်ဆင်မည်\n\n` +
      `🏘 မြို့နယ်: ${zone.township}\n` +
      `🏙 မြို့: ${zone.city || '-'}\n` +
      `💰 Fee: ${(zone.fee || 0).toLocaleString()} Ks\n\n` +
      `ဘာပြင်ချင်ပါသလဲ?`,
      {
        inline_keyboard: [
          [
            { text: '🏘 မြို့နယ်', callback_data: `AZONE_EDIT_FIELD_township_${idOrName}` },
            { text: '🏙 မြို့', callback_data: `AZONE_EDIT_FIELD_city_${idOrName}` },
          ],
          [
            { text: '💰 Fee', callback_data: `AZONE_EDIT_FIELD_fee_${idOrName}` },
          ],
          [{ text: '◀ Zones', callback_data: 'ADMIN_ZONES' }],
        ],
      }
    );
    return;
  }

  // ── Edit field selected ──
  if (data.startsWith('AZONE_EDIT_FIELD_')) {
    const rest = data.replace('AZONE_EDIT_FIELD_', '');
    const underscoreIdx = rest.indexOf('_');
    const field = rest.substring(0, underscoreIdx);
    const idOrName = rest.substring(underscoreIdx + 1);

    const fieldLabels: Record<string, string> = {
      township: '🏘 မြို့နယ်အသစ်',
      city: '🏙 မြို့အသစ်',
      fee: '💰 Fee အသစ် (ဂဏန်းသာ)',
    };

    let zoneName = '';
    if (isSheetMode(bot)) {
      zoneName = decodeURIComponent(idOrName);
    }

    const session = await getSession(bot.id, chatId);
    await updateAdminSession(session.id, {
      state: `editing_zone_${field}`,
      pendingData: { zoneId: idOrName, field, zoneName },
    });

    await sendTelegramMessage(token, chatId,
      `${fieldLabels[field] || field} ရိုက်ထည့်ပါ:\n\n/cancel ရိုက်၍ ပယ်ဖျက်နိုင်ပါတယ်`
    );
    return;
  }

  // ── Save new zone ──
  if (data === 'AZONE_ADD_SAVE') {
    const session = await getSession(bot.id, chatId);
    const pending = (session.pendingData as any) || {};

    if (!pending.township) {
      await sendTelegramMessage(token, chatId, '❌ Zone အချက်အလက် မပြည့်စုံပါ');
      return;
    }

    try {
      if (isSheetMode(bot)) {
        await appendZoneToSheet(bot.googleSheetId, {
          township: pending.township,
          city: pending.city || '',
          fee: pending.fee || 0,
        });
      } else {
        await prisma.deliveryZone.create({
          data: {
            botId: bot.id,
            township: pending.township,
            city: pending.city || '',
            fee: pending.fee || 0,
          },
        });
      }

      await updateAdminSession(session.id, { state: 'idle', pendingData: null });
      const target = isSheetMode(bot) ? 'Google Sheet' : 'Database';
      await sendTelegramMessage(token, chatId,
        `✅ *${pending.township}* zone ကို ${target} ထဲသို့ အောင်မြင်စွာ ထည့်ပြီးပါပြီ!`,
        {
          inline_keyboard: [
            [{ text: '🚚 Zones', callback_data: 'ADMIN_ZONES' }],
            [{ text: '➕ နောက်ထပ်ထည့်မည်', callback_data: 'AZONE_ADD' }],
            [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
          ],
        }
      );
    } catch (error) {
      console.error('Admin bot: zone create error:', error);
      await sendTelegramMessage(token, chatId, '❌ Zone ထည့်၍ မရပါ');
    }
    return;
  }
}

// ─── Text input handler ───────────────────────────────────────────────────────

export async function handleZoneTextInput(
  bot: TBot,
  token: string,
  chatId: string,
  text: string,
  session: Session
) {
  const pending = (session.pendingData as any) || {};

  // ── ADD ZONE FLOW ──

  if (session.state === 'adding_zone_township') {
    pending.township = text;
    await updateAdminSession(session.id, { state: 'adding_zone_city', pendingData: pending });
    await sendTelegramMessage(token, chatId, '🏙 မြို့ အမည် ရိုက်ထည့်ပါ (မရှိရင် `skip`):');
    return;
  }

  if (session.state === 'adding_zone_city') {
    if (text.toLowerCase() !== 'skip') pending.city = text;
    await updateAdminSession(session.id, { state: 'adding_zone_fee', pendingData: pending });
    await sendTelegramMessage(token, chatId, '💰 Delivery fee (Ks) ရိုက်ထည့်ပါ:');
    return;
  }

  if (session.state === 'adding_zone_fee') {
    const fee = parseFloat(text.replace(/,/g, ''));
    if (isNaN(fee)) {
      await sendTelegramMessage(token, chatId, '⚠️ ဂဏန်းသာ ရိုက်ပေးပါ (ဥပမာ: 2000)');
      return;
    }
    pending.fee = fee;

    const modeLabel = isSheetMode(bot) ? '📊 Google Sheet' : '🗄 Database';
    const msg =
      `✅ *အတည်ပြုမည်* (${modeLabel})\n\n` +
      `🏘 ${pending.township}\n` +
      `🏙 ${pending.city || '-'}\n` +
      `💰 ${fee.toLocaleString()} Ks`;

    await updateAdminSession(session.id, { state: 'adding_zone_confirm', pendingData: pending });

    await sendTelegramMessage(token, chatId, msg, {
      inline_keyboard: [
        [
          { text: '✅ သိမ်းမည်', callback_data: 'AZONE_ADD_SAVE' },
          { text: '❌ ပယ်ဖျက်', callback_data: 'ADMIN_ZONES' },
        ],
      ],
    });
    return;
  }

  // ── EDIT ZONE FLOW ──

  if (session.state.startsWith('editing_zone_')) {
    const field = pending.field;
    const zoneId = pending.zoneId;
    const zoneName = pending.zoneName || '';

    let value: any = text;
    if (field === 'fee') {
      value = parseFloat(text.replace(/,/g, ''));
      if (isNaN(value)) {
        await sendTelegramMessage(token, chatId, '⚠️ ဂဏန်းသာ ရိုက်ပေးပါ');
        return;
      }
    }

    try {
      if (isSheetMode(bot)) {
        const name = zoneName || decodeURIComponent(zoneId);
        await updateZoneInSheet(bot.googleSheetId, name, field, value);
      } else {
        await prisma.deliveryZone.update({
          where: { id: zoneId },
          data: { [field]: value },
        });
      }

      await updateAdminSession(session.id, { state: 'idle', pendingData: null });
      await sendTelegramMessage(token, chatId, `✅ *${field}* ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ`, {
        inline_keyboard: [
          [{ text: '🚚 Zones', callback_data: 'ADMIN_ZONES' }],
          [{ text: '🏠 Menu', callback_data: 'ADMIN_MENU' }],
        ],
      });
    } catch {
      await sendTelegramMessage(token, chatId, '❌ ပြင်ဆင်၍ မရပါ');
    }
    return;
  }
}
