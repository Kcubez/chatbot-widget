import { prisma } from '@/lib/prisma';
import { sendTelegramMessage, sendTypingIndicator, getTelegramFileUrl } from '@/lib/telegram';
import { verifyPaymentScreenshot } from '@/lib/ai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

type TBot = any;

const TELEGRAM_FORMAT_RULES = `
## Telegram Formatting Rules:
- NEVER use markdown code blocks (\`\`\`).
- Use *bold* and _italic_.
- Use emoji bullets.
- Keep responses short, persuasive, and conversational.
`;

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

export async function handleTelegramAgenticSaleUpdate(bot: TBot, token: string, update: any) {
  // Photo messages
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

      await sendTelegramMessage(token, chatId, '🔍 *စစ်ဆေးနေပါတယ်...* ခဏစောင့်ပါ');
      await sendTypingIndicator(token, chatId);

      const pending = (session.pendingData as any) || {};
      const expectedAmount = pending.subtotal || 0;

      try {
        const result = await verifyPaymentScreenshot(fileUrl, expectedAmount, bot.id);
        if (result.passed) {
          // Finish order
          await prisma.order.create({
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
              total: pending.subtotal, // Delivery fee can be handled by AI
              status: 'confirmed',
              paymentMethod: 'Bank Transfer/KPay',
            },
          });

          await updateSession(session.id, { state: 'browsing', pendingData: null });
          await sendTelegramMessage(
            token,
            chatId,
            `✅ *Payment Verified! Order Confirmed.*\n\nThank you for your purchase! Our team will process it shortly.`
          );
        } else {
          await sendTelegramMessage(
            token,
            chatId,
            `❌ ${result.feedback}\n\nသေချာပြန်စစ်ပြီး Screenshot ပို့ပေးပါ 🙏`
          );
        }
      } catch {
        await sendTelegramMessage(token, chatId, '⚠️ စစ်ဆေးရာ အမှားဖြစ်သွားပါတယ်။ ထပ်ပို့ပေးပါ။');
      }
      return;
    }
  }

  // Text messages
  if (update.message?.text) {
    const chatId = String(update.message.chat.id);
    const text: string = update.message.text;
    const session = await getSession(bot.id, chatId);

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

    await sendTypingIndicator(token, chatId);

    const apiKey = bot.user?.googleApiKey || process.env.GOOGLE_API_KEY || '';
    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      temperature: 0.7,
    });

    // Fetch Products, Knowledge Base & Delivery Zones
    const [products, documents, zones] = await Promise.all([
      prisma.product.findMany({
        where: { botId: bot.id, isActive: true },
        take: 50,
      }),
      prisma.document.findMany({
        where: { botId: bot.id },
        select: { title: true, content: true },
      }),
      prisma.deliveryZone.findMany({
        where: { botId: bot.id },
      }),
    ]);

    const productCatalog = products
      .map(
        p =>
          `- ${p.name} (Price: ${p.price} Ks) - Stock: ${p.stockCount} - Desc: ${p.description || ''}${p.image ? ` - ImageURL: ${p.image}` : ''}`
      )
      .join('\n');
    const knowledgeBase = documents.map(d => `### ${d.title}\n${d.content}`).join('\n\n');
    const deliveryInfo = zones
      .map(z => `- ${z.township} (${z.city || ''}): ${z.fee} Ks`)
      .join('\n');

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

Act as a professional and persuasive female sales assistant named "ကျွန်မ" ${bot.storeName ? `for "${bot.storeName}"` : ''}. 
STRICT RULE: NEVER refer to yourself as a "virtual assistant", "AI", or "bot". Introduce yourself naturally as the shop's sales representative.
NEGOTIATION SKILLS:
- Your goal is to close the sale.
- You are authorized to negotiate if the customer asks for a discount.
- You can offer a maximum of 10% discount on the subtotal to secure the order if needed.
- Be friendly, polite (using "ရှင်"), and convincing.
- If a user asks for a product photo, and you have an ImageURL for it, provide that ImageURL in your response.

${TELEGRAM_FORMAT_RULES}`;

    const checkoutTool = tool(
      async args => {
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
          itemsDescription: z.string().describe('Short summary of ordered items'),
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
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: text,
      },
    });

    // Fetch history
    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });

    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(systemPromptText),
    ];

    // Add history in chronological order
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
            },
          });

          let paymentMsg = bot.telegramPaymentMessage || '🏦 ငွေလွှဲရန် အကောင့်: KBZ Pay 09xxxxxx';
          const msg = `✅ *Summary*\n\nName: ${args.name}\nPhone: ${args.phone}\nAddress: ${args.address}, ${args.township}\nItems: ${args.itemsDescription}\nTotal: ${args.subtotal} Ks\n\n${paymentMsg}\n\n📸 *ကျေးဇူးပြု၍ ငွေလွှဲပြေစာကို ပို့ပေးပါ။*`;
          await sendTelegramMessage(token, chatId, msg);
          
          await prisma.message.create({
            data: { conversationId: conversation.id, role: 'assistant', content: msg }
          });
        }
      } else {
        const aiContent = response.content as string;
        
        // Save assistant response
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: aiContent,
          },
        });

        // Smart Photo Handling: If AI mentions a URL from our catalog, send it as a photo with caption
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = aiContent.match(urlRegex);
        
        if (urls && urls.length > 0) {
           const photoUrl = urls[0]; // Take the first URL found as the main photo
           const cleanContent = aiContent.replace(photoUrl, '').trim();
           
           if (photoUrl.includes('images.unsplash.com') || photoUrl.includes('vercel-storage.com') || photoUrl.includes('.jpg') || photoUrl.includes('.png')) {
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

async function sendTelegramPhoto(token: string, chatId: string, photoUrl: string, caption?: string) {
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
  }
}
