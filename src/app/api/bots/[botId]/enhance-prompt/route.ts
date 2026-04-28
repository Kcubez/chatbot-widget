import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

async function resolveApiKey(botId?: string): Promise<string> {
  if (botId) {
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      select: { user: { select: { googleApiKey: true } } },
    });
    if (bot?.user?.googleApiKey) return bot.user.googleApiKey;
  }
  return process.env.GOOGLE_API_KEY || '';
}

export async function POST(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  try {
    const { botId } = await params;
    const { rawPrompt } = await request.json();

    if (!rawPrompt || rawPrompt.trim() === '') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = await resolveApiKey(botId);

    if (!apiKey) {
      return NextResponse.json({ error: 'Google API Key not configured' }, { status: 400 });
    }

    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
    });

    const systemPromptText = `You are an expert AI prompt engineer specializing in customer service and business chatbots. Your task is to take a business owner's rough description of their bot and transform it into a highly professional, structured, and effective system prompt.

The final system prompt should be in Burmese (Myanmar) language if the user's input contains Burmese, or appropriately mixed if needed. It must be highly structured.

RULES FOR THE GENERATED PROMPT:
1. Start with a clear persona definition (who the bot is, what business it represents).
2. Define the tone of voice (polite, professional, helpful).
3. Include specific rules on how to answer questions (e.g., recommend products, mention opening hours if applicable).
4. Add formatting rules (e.g., use emojis, bullet points, no markdown code blocks).
5. Add constraints (e.g., politely decline unrelated questions).
6. Return ONLY the final generated system prompt text. Do not include any introductory or concluding conversational text like "Here is the prompt:" or "I have enhanced your prompt."

USER'S ROUGH DESCRIPTION:
${rawPrompt}`;

    const messages = [
      new SystemMessage(systemPromptText),
      new HumanMessage('Please enhance my prompt.'),
    ];

    const response = await llm.invoke(messages);
    const enhancedPrompt =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    return NextResponse.json({ enhancedPrompt: enhancedPrompt.trim() });
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
