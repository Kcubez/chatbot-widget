import { prisma } from '@/lib/prisma';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_API_KEY,
});

const TELEGRAM_FORMAT_RULES = `

## Formatting Rules (IMPORTANT - MUST FOLLOW):
- You are responding on Telegram. Use Telegram-compatible formatting ONLY.
- NEVER use code blocks (triple backticks \`\`\`). They create ugly "COPY CODE" buttons.
- NEVER use single backticks for inline code.
- For templates/formats/examples, use plain text with emoji bullets instead.
- Use *bold* for emphasis (single asterisks).
- Use _italic_ for subtle text (single underscores).
- Use line breaks for structure.
- Use emoji bullets (✅ 📌 ➡️ •) instead of markdown lists.
- Keep responses clean, readable, and mobile-friendly.`;

export async function generateBotResponse(
  botId: string,
  userMessage: string,
  history: { role: string; content: string }[] = [],
  platform: 'telegram' | 'web' = 'web'
) {
  const bot = await prisma.bot.findUnique({
    where: { id: botId },
    include: { documents: true },
  });

  if (!bot) throw new Error('Bot not found');

  let systemPromptText = bot.systemPrompt;

  // Add platform-specific formatting rules
  if (platform === 'telegram') {
    systemPromptText += TELEGRAM_FORMAT_RULES;
  }

  const aiMessages: (SystemMessage | HumanMessage | AIMessage)[] = [
    new SystemMessage(systemPromptText),
  ];

  if (bot.documents && bot.documents.length > 0) {
    const context = bot.documents.map(doc => doc.content).join('\n');
    aiMessages[0] = new SystemMessage(`${systemPromptText}\n\nContext:\n${context}`);
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
