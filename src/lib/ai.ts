import { prisma } from '@/lib/prisma';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_API_KEY,
});

export async function generateBotResponse(
  botId: string,
  userMessage: string,
  history: { role: string; content: string }[] = []
) {
  const bot = await prisma.bot.findUnique({
    where: { id: botId },
    include: { documents: true },
  });

  if (!bot) throw new Error('Bot not found');

  const aiMessages: (SystemMessage | HumanMessage | AIMessage)[] = [
    new SystemMessage(bot.systemPrompt),
  ];

  if (bot.documents && bot.documents.length > 0) {
    const context = bot.documents.map(doc => doc.content).join('\n');
    aiMessages[0] = new SystemMessage(`${bot.systemPrompt}\n\nContext:\n${context}`);
  }

  // Add history
  for (const msg of history) {
    if (msg.role === 'user') {
      aiMessages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant') {
      aiMessages.push(new AIMessage(msg.content));
    }
  }

  // Add current message
  aiMessages.push(new HumanMessage(userMessage));

  const response = await llm.invoke(aiMessages);
  const aiResponse =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  return aiResponse;
}
