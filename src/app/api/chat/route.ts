import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateBotResponse } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const { botId, chatId, messages, lang, langSwitchIndex = 0 } = await request.json();

    // Fetch bot
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { documents: true },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Handle conversation persistence
    if (chatId) {
      const existingConversation = await prisma.conversation.findUnique({
        where: { id: chatId },
      });

      if (!existingConversation) {
        await prisma.conversation.create({
          data: { id: chatId, botId },
        });
      }

      // Save user message
      if (messages && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'user') {
          await prisma.message.create({
            data: {
              id: `msg_${Date.now()}`,
              conversationId: chatId,
              role: 'user',
              content: lastMsg.content,
            },
          });
        }
      }
    }

    // Fetch active products for this bot to provide image context
    const products = await prisma.product.findMany({
      where: { botId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    // Build product context with image embedding instructions
    let productContext = '';
    if (products.length > 0) {
      productContext =
        `\n\nPRODUCT CATALOG:\n` +
        products
          .map(
            p =>
              `- Name: ${p.name} | Price: ${p.price.toLocaleString()} Ks | Category: ${p.category} | Stock: ${p.stockCount > 0 ? `${p.stockCount} available` : 'OUT OF STOCK'}${p.description ? ` | Desc: ${p.description}` : ''}${p.image ? ` | IMAGE_URL: ${p.image}` : ''}`
          )
          .join('\n') +
        `\n\nPRODUCT IMAGE RULE: When a user asks to see, show, or view an image of any product, embed it using this EXACT format on its own line:\n[PRODUCT_IMAGE:IMAGE_URL_HERE]\nOnly embed the image if the product has an IMAGE_URL. Always show the product name and price alongside the image.`;
    }

    const userMessage = messages[messages.length - 1].content;
    const isFirstMessage = messages.filter((m: any) => m.role === 'user').length === 1;

    // Build greeting rule — only add to FIRST message context
    const greetingRule = isFirstMessage
      ? `\n\nGREETING RULE: This is the customer's FIRST message. You MAY greet them warmly once.`
      : `\n\nGREETING RULE: IMPORTANT — Do NOT greet or say "မင်္ဂလာပါ" or "ကြိုဆိုပါတယ်" again. The customer has already been greeted. Go straight to answering their question.`;

    const messageWithContext = `${userMessage}${productContext}${greetingRule}`;

    // Only use messages AFTER the last language switch as AI history context.
    // This stops old-language messages from contaminating the new language session
    // while keeping everything visible on screen for the user.
    const historyForAI = messages.slice(langSwitchIndex, -1);

    // Generate response using shared utility
    const aiResponse = await generateBotResponse(
      botId,
      messageWithContext,
      historyForAI,
      'web',
      lang
    );

    // Save assistant message
    if (chatId) {
      await prisma.message.create({
        data: {
          id: `ai_${Date.now()}`,
          conversationId: chatId,
          role: 'assistant',
          content: aiResponse,
        },
      });
    }

    // Return in Vercel AI SDK format
    return new NextResponse(`0:${JSON.stringify(aiResponse)}\n`, {
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}
