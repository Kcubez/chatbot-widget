import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { botId, chatId, messages } = await request.json();

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

    // Prepare messages for AI
    const aiMessages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(bot.systemPrompt),
    ];

    if (bot.documents && bot.documents.length > 0) {
      const context = bot.documents.map(doc => doc.content).join('\n');
      aiMessages[0] = new SystemMessage(`${bot.systemPrompt}\n\nContext:\n${context}`);
    }

    for (const msg of messages || []) {
      if (msg.role === 'user') {
        aiMessages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        aiMessages.push(new AIMessage(msg.content));
      }
    }

    // Generate response
    const response = await llm.invoke(aiMessages);
    const aiResponse =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

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
