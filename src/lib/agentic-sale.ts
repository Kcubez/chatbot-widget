import { prisma } from '@/lib/prisma';
import {
  sendTelegramMessage,
  sendTypingIndicator,
  getTelegramFileUrl,
  answerCallbackQuery,
} from '@/lib/telegram';
import { verifyPaymentScreenshot } from '@/lib/ai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getProducts, getProductById, searchProducts, getDeliveryZones } from '@/lib/data-provider';
import { syncOrderToSheet, deductStockInSheet } from '@/lib/sheets';
import { notifyAdminNewOrder } from '@/lib/admin-bot';
import { after } from 'next/server';

type TBot = any;

const TELEGRAM_FORMAT_RULES = `
## Telegram Formatting Rules:
- NEVER use markdown code blocks (\`\`\`).
- Use *bold* and _italic_.
- Use emoji bullets.
- Keep responses short, persuasive, and conversational.
- NEVER dump a list of product image URLs — the carousel handles photos automatically.
- CRITICAL: NEVER output raw JSON, object notation, or curly braces {} in your response to the user. If you need to call a tool, call it silently — do NOT write out the data as text.
- CRITICAL: If you are about to call trigger_checkout, do NOT also write out the order details as JSON. The tool call handles everything.
`;

// ─── Session helpers ──────────────────────────────────────────────────────────

async function getSession(botId: string, chatId: string) {
  return prisma.telegramSaleSession.upsert({
    where: { botId_telegramChatId: { botId, telegramChatId: chatId } },
    create: { botId, telegramChatId: chatId, state: 'browsing' },
    update: {},
  });
}

async function updateSession(id: string, data: any) {
  return prisma.telegramSaleSession.update({ where: { id }, data });
}

// ─── Product Carousel ─────────────────────────────────────────────────────────

/** Keywords that trigger the carousel directly (bypassing AI to save tokens) */
const SHOW_PRODUCTS_TRIGGERS = [
  'ပစ္စည်း',
  'product',
  'show',
  'ကြည့်',
  'list',
  'catalog',
  'မျိုး',
  'ဘာတွေ',
  'ဘာရှိ',
  'items',
  'menu',
  'ပြပါ',
  'ပြချင်',
  'ရောင်း',
  'ဘာဝယ်',
  'ပစ္စည်းများ',
  'all products',
];

function isShowProductsIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return SHOW_PRODUCTS_TRIGGERS.some(t => lower.includes(t));
}

/**
 * Send one product card (photo + caption + nav buttons) at the given index.
 * Layout:
 *   📸 [Product photo — full width]
 *   📦 Name  💰 Price | Category
 *   ✅ Stock | 📝 Description...
 *   [🛒 မှာယူမည်]  [📞 ဆက်သွယ်မည်]
 *   [◀ ယခင်]  [1 / N]  [နောက် ▶]
 *   [🏠 Menu သို့ပြန်မည်]
 */
async function showProductCarousel(bot: TBot, token: string, chatId: string, index: number) {
  const products = await getProducts(bot);

  if (products.length === 0) {
    await sendTelegramMessage(token, chatId, '🙏 လောလောဆယ် ပစ္စည်းများ မရှိသေးပါ', {
      inline_keyboard: [[{ text: '🏠 Menu', callback_data: 'AGENT_MENU' }]],
    });
    return;
  }

  const total = products.length;
  const i = Math.max(0, Math.min(index, total - 1));
  const p = products[i];

  const stockBadge = p.stockCount > 0 ? `✅ Stock: ${p.stockCount}` : '❌ Out of Stock';
  const caption =
    `📦 *${p.name}*\n` +
    `💰 ${p.price.toLocaleString()} Ks  |  ${p.category}\n` +
    `${stockBadge}` +
    (p.description ? `\n\n📝 ${p.description.substring(0, 180)}` : '');

  // ── Navigation row ──
  const navRow: { text: string; callback_data: string }[] = [];
  if (i > 0) navRow.push({ text: '◀ ယခင်', callback_data: `PROD_NAV_${i - 1}` });
  navRow.push({ text: `${i + 1} / ${total}`, callback_data: 'PROD_COUNT' });
  if (i < total - 1) navRow.push({ text: 'နောက် ▶', callback_data: `PROD_NAV_${i + 1}` });

  // ── Action row ──
  const actionRow =
    p.stockCount > 0
      ? [
          { text: '🛒 မှာယူမည်', callback_data: `AGENT_ORDER_${p.id}` },
          { text: '📞 ဆက်သွယ်မည်', callback_data: 'AGENT_CONTACT' },
        ]
      : [
          {
            text: '❌ Out of Stock — နောက်ကြည့်မည်',
            callback_data: `PROD_NAV_${Math.min(i + 1, total - 1)}`,
          },
        ];

  const keyboard = {
    inline_keyboard: [
      actionRow,
      navRow,
      [{ text: '🏠 Menu သို့ပြန်မည်', callback_data: 'AGENT_MENU' }],
    ],
  };

  if (p.image) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: p.image,
        caption,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }),
    });
    if (!res.ok) {
      // Fallback to text message if photo fails
      await sendTelegramMessage(token, chatId, caption, keyboard);
    }
  } else {
    await sendTelegramMessage(token, chatId, caption, keyboard);
  }
}

// ─── Detect garbage / non-Myanmar responses (e.g. Korean from quota errors) ────

/**
 * Returns true if the text is predominantly Korean characters.
 * Korean Hangul syllables: \uAC00–\uD7A3, Hangul Jamo: \u1100–\u11FF
 */
function isGarbageResponse(text: string): boolean {
  const koreanChars = (text.match(/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/g) || []).length;
  // If more than 5 Korean chars → treat as garbage / quota-error response
  return koreanChars > 5;
}

// ─── Sanitize AI response — strip accidental JSON output ──────────────────────

function sanitizeAiResponse(text: string): string {
  let result = text;

  // Remove markdown code blocks: ```json ... ``` or ``` ... ```
  result = result.replace(/```[\s\S]*?```/g, '');

  // Remove standalone JSON objects/arrays: lines that start with { or [
  // and end with } or ] (multiline)
  result = result.replace(/\{[\s\S]*?\}/g, match => {
    // Only remove if it looks like structured data (has "key": "value" pattern)
    if (/"\w+":\s*/.test(match)) return '';
    return match;
  });

  // Clean up leftover blank lines from removed blocks
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleTelegramAgenticSaleUpdate(bot: TBot, token: string, update: any) {
  // ── Carousel button callbacks (◀ / ▶ / Order / Menu) ──
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message.chat.id);
    await answerCallbackQuery(token, cq.id);
    const data: string = cq.data;

    // Navigate carousel
    if (data.startsWith('PROD_NAV_')) {
      const idx = parseInt(data.replace('PROD_NAV_', ''), 10);
      await showProductCarousel(bot, token, chatId, idx);
      return;
    }

    // Page-count indicator (no-op)
    if (data === 'PROD_COUNT') return;

    // Menu shortcut
    if (data === 'AGENT_MENU') {
      await sendTelegramMessage(
        token,
        chatId,
        `🏠 ဘာကူညီပေးရမလဲ? ပစ္စည်းများ ကြည့်ချင်ရင် ◀️ ခလုတ်တွေနဲ့ browse လုပ်နိုင်ပါတယ် 😊`,
        {
          inline_keyboard: [[{ text: '📦 ပစ္စည်းများကြည့်မည်', callback_data: 'PROD_NAV_0' }]],
        }
      );
      return;
    }

    // Contact
    if (data === 'AGENT_CONTACT') {
      const msg =
        bot.telegramContactMessage ||
        bot.messengerContactMessage ||
        '📞 09-000-000-000 ကို ဆက်သွယ်နိုင်ပါတယ် 😊';
      await sendTelegramMessage(token, chatId, msg);
      return;
    }

    // Order intent from carousel button
    if (data.startsWith('AGENT_ORDER_')) {
      const productId = data.replace('AGENT_ORDER_', '');
      const product = await getProductById(bot, productId);
      if (product) {
        await sendTelegramMessage(
          token,
          chatId,
          `🛒 *${product.name}* ကို မှာယူလိုပါက အောက်ပါ အချက်အလက်များ ပေးပို့ ပေးပါနော် ✍️\n\n` +
            `👤 အမည်:\n📱 ဖုန်းနံပါတ်:\n🏠 လိပ်စာ / မြို့နယ်:\n📦 အရေအတွက်:\n\n` +
            `သို့မဟုတ် chat ထဲမှာ တိုက်ရိုက် ပြောပြနိုင်ပါတယ်နော် 😊`
        );
      }
      return;
    }

    return;
  }

  // ── Photo messages (payment slip) ──
  if (update.message?.photo) {
    const chatId = String(update.message.chat.id);
    const session = await getSession(bot.id, chatId);

    if (session.state === 'awaiting_payment_slip') {
      const photos = update.message.photo;
      const largest = photos[photos.length - 1];
      const fileUrl = await getTelegramFileUrl(token, largest.file_id);

      if (!fileUrl) {
        await sendTelegramMessage(
          token,
          chatId,
          '⚠️ ဓာတ်ပုံ download လုပ်လို့ မရပါ။ ထပ်ပို့ပေးပါ။'
        );
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
      const expectedAmount = pending.subtotal || 0;

      after(async () => {
        try {
          const result = await verifyPaymentScreenshot(fileUrl, expectedAmount, bot.id);
          if (result.passed) {
            const order = await prisma.order.create({
              data: {
                botId: bot.id,
                platform: 'telegram',
                telegramChatId: chatId,
                customerName: pending.name || 'Unknown',
                customerPhone: pending.phone || 'Unknown',
                customerAddress: pending.address || 'Unknown',
                customerTownship: pending.township || 'Unknown',
                items: pending.items || [],
                subtotal: pending.subtotal,
                total: pending.subtotal,
                status: 'confirmed',
                paymentMethod: 'Bank Transfer/KPay',
              },
            });

            await updateSession(session.id, { state: 'browsing', pendingData: null });
            const successMsg = `✅ *ငွေပေးချေမှု အောင်မြင်ပါတယ်ရှင်!*

လူကြီးမင်းမှာယူထားတဲ့ Order ကို အောင်မြင်စွာ လက်ခံရရှိထားပြီး ဖြစ်ပါတယ်ရှင်။ ကျွန်မတို့အဖွဲ့သားများက အမြန်ဆုံး စစ်ဆေးပြီး ပစ္စည်းများကို ပို့ဆောင်ပေးသွားမှာ ဖြစ်ပါတယ်ရှင်။ 

ကျွန်မတို့ဆီမှာ အားပေးတဲ့အတွက် အထူးကျေးဇူးတင်ပါတယ်ရှင်။ 😊

ဒါ့အပြင်... လူကြီးမင်းအနေနဲ့ တခြားစိတ်ဝင်စားစရာ စာအုပ်လေးတွေရော ထပ်ကြည့်ချင်ပါသေးသလားရှင်? ကျွန်မ ဘာများ ထပ်ကူညီပေးရမလဲဆိုတာ ပြောပြပေးပါဦးနော်။`;

            await sendTelegramMessage(token, chatId, successMsg);

            // ── Admin push notification (fire-and-forget, never blocks customer flow) ──
            notifyAdminNewOrder(bot, order).catch(err =>
              console.error('Admin notification failed:', err)
            );

            let conversation = await prisma.conversation.findFirst({
              where: { telegramChatId: chatId, botId: bot.id },
            });

            if (conversation) {
              await prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  role: 'assistant',
                  content: successMsg,
                },
              });

              // ── Reset conversation history so the AI starts fresh ──
              // Without this, the AI bundles previous order items into the next order.
              await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
              await prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  role: 'assistant',
                  content: '✅ Order တင်ပြီးပြီ။ Customer ကို ကြိုဆိုပြီး ထပ်ဝယ်ချင်ရင် ကူညီပေးပါ။',
                },
              });
            }

            // ── Google Sheets: add order row + deduct stock ──
            if (bot.googleSheetId) {
              try {
                const synced = await syncOrderToSheet(
                  bot.googleSheetId,
                  bot.googleSheetName || 'Orders',
                  order
                );
                if (synced) {
                  await prisma.order.update({
                    where: { id: order.id },
                    data: { sheetSynced: true },
                  });
                }
              } catch (err) {
                console.error('Agentic bot: Sheets order sync failed:', err);
              }

              // Deduct stock from Products tab
              const orderedItems: { name: string; qty: number }[] = Array.isArray(pending.items)
                ? (pending.items as any[])
                    .filter((i: any) => i?.name)
                    .map((i: any) => ({ name: String(i.name), qty: Number(i.qty) || 1 }))
                : [];

              if (orderedItems.length > 0) {
                try {
                  await deductStockInSheet(
                    bot.googleSheetId,
                    bot.googleSheetProductTab || 'Products',
                    orderedItems
                  );
                } catch (err) {
                  console.error('Agentic bot: Sheets stock deduction failed:', err);
                }
              }
            }
          } else {
            // AI says screenshot is invalid → reset state so user can retry
            await updateSession(session.id, { state: 'awaiting_payment_slip' });
            await sendTelegramMessage(
              token,
              chatId,
              `❌ ${result.feedback}\n\nသေချာပြန်စစ်ပြီး Screenshot ပို့ပေးပါ 🙏`
            );
          }
        } catch (err) {
          console.error('[AgenticSale] Payment verification error (no retry):', err);
          // ── Manual fallback: create order for admin review immediately ──
          try {
            const order = await prisma.order.create({
              data: {
                botId: bot.id,
                platform: 'telegram',
                telegramChatId: chatId,
                customerName: pending.name || 'Unknown',
                customerPhone: pending.phone || 'Unknown',
                customerAddress: pending.address || 'Unknown',
                customerTownship: pending.township || 'Unknown',
                items: pending.items || [],
                subtotal: pending.subtotal,
                total: pending.subtotal,
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
            notifyAdminNewOrder(bot, order).catch(console.error);
          } catch (fallbackErr) {
            console.error('[AgenticSale] Manual fallback also failed:', fallbackErr);
            await sendTelegramMessage(
              token,
              chatId,
              '⚠️ စနစ်မှာ အဆင်မပြေဖြစ်နေပါတယ်။ ခဏနေမှ ထပ်ကြိုးစားပေးပါခင်ဗျာ。🙏'
            );
          }
        }
      });
      return;
    }
  }

  // ── Text messages ──
  if (update.message?.text) {
    const chatId = String(update.message.chat.id);
    const text: string = update.message.text;
    const session = await getSession(bot.id, chatId);

    // ── /start — rich welcome greeting with top-5 product list ──
    if (text === '/start') {
      const storeName = bot.storeName || bot.name || 'ဆိုင်';

      // Fetch products and pick last 5
      const allProducts = await getProducts(bot);
      const featured = allProducts.slice(-5);

      let welcomeMsg = `မင်္ဂလာပါရှင်။ ကျွန်မကတော့ *${storeName}* ရဲ့ အရောင်းဝန်ထမ်း ဖြစ်ပါတယ်ရှင်။ 🙏\n\n`;

      if (featured.length > 0) {
        // Build product list lines
        const productLines = featured
          .map(p => `✨ *${p.name}* - ${p.price.toLocaleString()} ကျပ်`)
          .join('\n');

        welcomeMsg +=
          `ဗဟုသုတနဲ့ စိတ်ခွန်အားတိုးစေမယ့် eBook ကောင်းလေးတွေကို ကျွန်မတိုဆီမှာ သင့်တင့်တဲ့ ဈေးနှုန်းလေးတွေနဲ့ ဝယ်ယူရရှိနိုင်ပါတယ်ရှင်။\n\n` +
          `လက်ရှိ လူကြိုက်အများဆုံး စာအုပ်လေးတွေကတော့ -\n\n` +
          `${productLines}\n\n` +
          `ဒီစာအုပ်လေးတွေက eBook အမျိုးအစားတွေဖြစ်လို ငွေလွှဲပြီးတာနဲ့ အွန်လိုင်းကနေ တစ်ဆင့် ချက်ချင်း ပို့ဆောင်ပေးမှာပါရှင်။ ပိုခလည်း လုံးဝ ပေးစရာမလိုပါဘူးရှင်။\n\n` +
          `လူကြီးမင်းအနေနဲ့ ဘယ်စာအုပ်လေးကို စိတ်ဝင်စားပါသလဲရှင်? ကျွန်မကို မေးမြန်းနိုင်ပါတယ်ရှင်။ ✨`;
      } else {
        welcomeMsg +=
          `ကျွန်မတိုဆီမှာ eBook ကောင်းလေးတွေ ရှိပါတယ်ရှင်။\n\n` +
          `ဘာများ ကူညီပေးရမလဲဆိုတာ ပြောပြပေးပါဦးနော် ✨`;
      }

      await sendTelegramMessage(token, chatId, welcomeMsg, {
        inline_keyboard: [[{ text: '📦 ပစ္စည်းများကြည့်မည်', callback_data: 'PROD_NAV_0' }]],
      });
      return;
    }

    // Awaiting payment slip
    if (session.state === 'awaiting_payment_slip') {
      if (text === '/cancel') {
        await updateSession(session.id, { state: 'browsing', pendingData: null });
        await sendTelegramMessage(token, chatId, '❌ Order cancelled. You can continue shopping.');
      } else {
        await sendTelegramMessage(
          token,
          chatId,
          '📸 ကျေးဇူးပြု၍ ငွေလွှဲပြေစာကို ဓာတ်ပုံရိုက်ပြီး ပို့ပေးပါ။ /cancel ရိုက်၍ ဖျက်နိုင်ပါသည်။'
        );
      }
      return;
    }

    // ── Shortcut: show carousel without burning AI tokens ──
    if (isShowProductsIntent(text)) {
      await showProductCarousel(bot, token, chatId, 0);
      return;
    }

    // ── AI agent path ──
    await sendTypingIndicator(token, chatId);

    const apiKey = bot.user?.googleApiKey || process.env.GOOGLE_API_KEY || '';
    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      temperature: 0.7,
    });

    // Fetch Knowledge Base, Delivery Zones & Products in parallel
    const searchKeywords = text
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    const [documents, zones, relevantProducts] = await Promise.all([
      prisma.document.findMany({
        where: { botId: bot.id },
        select: { title: true, content: true },
      }),
      getDeliveryZones(bot),
      searchProducts(bot, searchKeywords),
    ]);

    const productCatalog = relevantProducts
      .map(
        (p: any) =>
          `- ${p.name} (${p.price} Ks) - Stock: ${p.stockCount}${p.description ? ` - ${p.description.substring(0, 50)}...` : ''}${p.image ? ` - Image: ${p.image}` : ''}`
      )
      .join('\n');

    const knowledgeBase = documents.map((d: any) => `### ${d.title}\n${d.content}`).join('\n\n');
    const deliveryInfo = zones.map((z: any) => `- ${z.township}: ${z.fee} Ks`).join('\n');

    let botPlaybook = bot.systemPrompt || '';
    if (!botPlaybook) {
      botPlaybook = `You are a proactive sales agent. Propose items, build rapport, and close sales. Negotiate if needed (max 10% discount). When the user is ready to buy, ask for their delivery details. After collecting all info, call the checkout tool.`;
    }

    const systemPromptText = `${botPlaybook}

## Product Catalog:
${productCatalog}

## Delivery Zones & Fees (Delivery Info):
${deliveryInfo}

## Knowledge Base (Policies, FAQ):
${knowledgeBase || 'No additional info provided.'}

Current localized time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' })}
Always communicate in Myanmar language (Unicode) ONLY. 
STRICT RULE: NEVER use Thai characters or Thai language (e.g., Sawasdee). Only use Burmese (Unicode). 

Act as a professional and persuasive female sales assistant ${bot.storeName ? `for "${bot.storeName}"` : ''}. 
STRICT RULE: NEVER refer to yourself as a "virtual assistant", "AI", or "bot". Introduce yourself naturally as the shop's sales representative.
Using the first-person pronoun "ကျွန်မ" (feminine "I") is appropriate for your role.
Introduce yourself simply as the shop's sales representative without putting "ကျွန်မ" in quotes as a name.
For example, instead of saying 'ကျွန်မကတော့ ဆိုင်ရဲ့ အရောင်းဝန်ထမ်း "ကျွန်မ" ဖြစ်ပါတယ်ရှင်။', you should say 'ကျွန်မကတော့ ဆိုင်ရဲ့ အရောင်းဝန်ထမ်း ဖြစ်ပါတယ်ရှင်။' or 'ကျွန်မကတော့ ${bot.storeName || 'ဆိုင်'} ရဲ့ အရောင်းဝန်ထမ်း ဖြစ်ပါတယ်ရှင်။'.

NEGOTIATION SKILLS:
- Your goal is to close the sale.
- You are authorized to negotiate if the customer asks for a discount.
- You can offer a maximum of 10% discount on the subtotal to secure the order if needed.
- Be friendly, polite (using "ရှင်"), and convincing.
- If a user asks for a specific product photo, mention its name and price — the carousel will handle the image display.

${TELEGRAM_FORMAT_RULES}`;

    const checkoutTool = tool(
      async _args => {
        return JSON.stringify({ success: true, message: 'Checkout triggered!' });
      },
      {
        name: 'trigger_checkout',
        description:
          'Call this ONLY when you have collected the users name, phone, address, and the final agreed order with price. This will show them payment instructions.',
        schema: z.object({
          name: z.string().describe('Customer Name'),
          phone: z.string().describe('Customer Phone'),
          address: z.string().describe('Customer Full Address'),
          township: z.string().describe('Customer Township/City'),
          subtotal: z.number().describe('Final total price in Ks'),
          itemsDescription: z
            .string()
            .describe('Short summary of ordered items e.g. "Book A x2, Book B x1"'),
          items: z
            .array(
              z.object({
                name: z.string().describe('Exact product name'),
                qty: z.number().int().min(1).describe('Quantity ordered'),
              })
            )
            .optional()
            .describe(
              'Structured list of ordered items with name and quantity for stock deduction'
            ),
        }),
      }
    );

    const llmWithTools = llm.bindTools([checkoutTool]);

    // Fetch or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { telegramChatId: chatId, botId: bot.id },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          botId: bot.id,
          telegramChatId: chatId,
          title: `Telegram Chat ${chatId}`,
        },
      });
    }

    // Save user message
    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', content: text },
    });

    // Fetch history (last 8 messages to save tokens)
    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(systemPromptText),
    ];

    history.reverse().forEach(msg => {
      if (msg.role === 'assistant') {
        messages.push(new AIMessage(msg.content));
      } else if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      }
    });

    try {
      const response = await llmWithTools.invoke(messages);

      if (response.tool_calls && response.tool_calls.length > 0) {
        const call = response.tool_calls[0];
        if (call.name === 'trigger_checkout') {
          const args = call.args;
          await updateSession(session.id, {
            state: 'awaiting_payment_slip',
            pendingData: {
              name: args.name,
              phone: args.phone,
              address: args.address,
              township: args.township,
              subtotal: args.subtotal,
              itemsDescription: args.itemsDescription,
              items: args.items || [],
            },
          });

          const paymentMsg =
            bot.telegramPaymentMessage || '🏦 ငွေလွှဲရန် အကောင့်: KBZ Pay 09xxxxxx';
          const msg =
            `✅ *Summary*\n\n` +
            `Name: ${args.name}\nPhone: ${args.phone}\n` +
            `Address: ${args.address}, ${args.township}\n` +
            `Items: ${args.itemsDescription}\nTotal: ${args.subtotal} Ks\n\n` +
            `${paymentMsg}\n\n📸 *ကျေးဇူးပြု၍ ငွေလွှဲပြေစာကို ပို့ပေးပါ။*`;
          await sendTelegramMessage(token, chatId, msg);

          await prisma.message.create({
            data: { conversationId: conversation.id, role: 'assistant', content: msg },
          });
        }
      } else {
        // Sanitize: strip any raw JSON the AI may have accidentally output
        const rawContent = response.content as string;
        const aiContent = sanitizeAiResponse(rawContent);

        // ── Garbage / Korean quota-error detection ──
        // If the AI returned Korean text (happens when API quota is exhausted),
        // flush the conversation history so it stops repeating, then bail out.
        if (isGarbageResponse(aiContent)) {
          console.warn('[AgenticSale] Garbage/Korean response detected — flushing conversation history.');
          await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
          let errorMsg = '⚠️ စနစ်မှာ အနည်းငယ် အဆင်မပြေဖြစ်နေလို့ ခဏနေမှ ထပ်ကြိုးစားကြည့်ပေးပါခင်ဗျာ။ 🙏';
          if (bot.telegramContactMessage) {
            errorMsg += `\n\nသို့မဟုတ် အောက်ပါလင့်ခ်မှတဆင့် ဆက်သွယ်ပေးပါဦးနော်👇\n${bot.telegramContactMessage}`;
          }
          await sendTelegramMessage(token, chatId, errorMsg);
          return;
        }

        if (!aiContent.trim()) {
          // AI produced only JSON and nothing else — silently ignore, no message sent
          return;
        }

        await prisma.message.create({
          data: { conversationId: conversation.id, role: 'assistant', content: aiContent },
        });

        // Smart Photo Handling: send first image URL found as a proper photo message
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = aiContent.match(urlRegex);

        if (urls && urls.length > 0) {
          const photoUrl = urls[0];
          const cleanContent = aiContent.replace(photoUrl, '').trim();

          if (
            photoUrl.includes('images.unsplash.com') ||
            photoUrl.includes('vercel-storage.com') ||
            photoUrl.includes('.jpg') ||
            photoUrl.includes('.png') ||
            photoUrl.includes('.webp')
          ) {
            await sendTelegramPhoto(token, chatId, photoUrl, cleanContent);
          } else {
            await sendTelegramMessage(token, chatId, aiContent);
          }
        } else {
          await sendTelegramMessage(token, chatId, aiContent);
        }
      }
    } catch (error) {
      console.error('Agentic Sale Bot Error:', error);
      let errorMsg =
        '⚠️ စနစ်မှာ အနည်းငယ် အဆင်မပြေဖြစ်နေလို့ ခဏနေမှ ထပ်ကြိုးစားကြည့်ပေးပါခင်ဗျာ။ 🙏';
      if (bot.telegramContactMessage) {
        errorMsg += `\n\nသို့မဟုတ် အောက်ပါလင့်ခ်မှတဆင့် ဆက်သွယ်ပေးပါဦးနော်👇\n${bot.telegramContactMessage}`;
      }
      await sendTelegramMessage(token, chatId, errorMsg);
    }
  }
}

// ─── Internal photo helper ────────────────────────────────────────────────────

async function sendTelegramPhoto(
  token: string,
  chatId: string,
  photoUrl: string,
  caption?: string
) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: caption || '',
        parse_mode: 'Markdown',
      }),
    });
  } catch (error) {
    console.error('Failed to send Telegram photo:', error);
    if (caption) await sendTelegramMessage(token, chatId, caption);
  }
}
