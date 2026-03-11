import { prisma } from '@/lib/prisma';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

// Helper: resolve the user's API key or fall back to global env
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

function createLLM(apiKey: string) {
  return new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey,
  });
}

// Default LLM (used when no botId context is available)
const llm = createLLM(process.env.GOOGLE_API_KEY || '');

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
  platform: 'telegram' | 'web' = 'web',
  lang?: 'en' | 'my'
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

  // ── Language Override (platform-level, highest authority) ──────────────────
  // This is injected at the system level so it always overrides any language
  // instruction the bot owner may have written in their system prompt.
  if (lang) {
    const langName = lang === 'en' ? 'English' : 'Myanmar (Burmese)';
    const langOverride = `\n\n---\n[PLATFORM LANGUAGE OVERRIDE — HIGHEST PRIORITY]\nRegardless of any other instructions above, you MUST respond EXCLUSIVELY in ${langName}. Do NOT use any other language in your response.`;
    systemPromptText += langOverride;
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

  // Use per-user API key if available
  const apiKey = await resolveApiKey(botId);
  const llmInstance = createLLM(apiKey);

  const response = await llmInstance.invoke(aiMessages);
  const aiResponse =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  return aiResponse;
}

/**
 * Verify a text submission against reference material
 * Used when user writes a summary and AI checks if it's correct
 */
export async function verifyTextSubmission(
  userText: string,
  verificationPrompt: string,
  stepLabel: string,
  botId?: string
): Promise<{ passed: boolean; reason: string; feedback: string }> {
  try {
    const prompt = `You are a verification assistant. Your job is to check if a user's text submission meets the requirements.

## Step: "${stepLabel}"
## Reference Material / What to check:
${verificationPrompt}

## User's Submission:
${userText}

## Response Format (MUST follow exactly):
Respond ONLY with a JSON object, nothing else:
{"passed": true/false, "reason": "brief technical reason in English", "feedback": "friendly detailed message in Myanmar/Burmese for the user"}

## Rules:
- Compare the user's submission against the reference material
- The user doesn't need to cover EVERY point — if they cover the main ideas (at least 50-60%), pass them
- Be lenient and encouraging — this is onboarding, not an exam
- If they clearly made an effort and got the gist right, pass them
- If the submission is completely wrong, too short (just 1-2 words), or unrelated, fail them
- In feedback: if PASSED, mention what they got right. If FAILED, hint at what they missed
- feedback MUST be in Myanmar language
- reason stays in English`;

    const apiKey = await resolveApiKey(botId);
    const llmInstance = createLLM(apiKey);
    const response = await llmInstance.invoke([new HumanMessage(prompt)]);
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        passed: !!result.passed,
        reason: result.reason || 'No reason provided',
        feedback: result.feedback || (result.passed ? '✅ စစ်ဆေးပြီးပါပြီ!' : '❌ ပြန်စစ်ပေးပါ။'),
      };
    }

    return {
      passed: false,
      reason: 'Could not parse AI response',
      feedback: '⚠️ စစ်ဆေးမှု မအောင်မြင်ပါ။ ပြန်ပို့ပေးပါ။',
    };
  } catch (err) {
    console.error('Text verification error:', err);
    return {
      passed: false,
      reason: `Verification error: ${err}`,
      feedback: '⚠️ စစ်ဆေးရာမှာ အမှားတစ်ခု ဖြစ်သွားပါတယ်။ ပြန်ပို့ပေးပါ။',
    };
  }
}
/**
 * Verify an uploaded image using Gemini Vision AI
 * Returns { passed: boolean, reason: string, feedback: string }
 */
export async function verifyUploadedImage(
  imageUrl: string,
  verificationPrompt: string,
  stepLabel: string,
  botId?: string
): Promise<{ passed: boolean; reason: string; feedback: string }> {
  try {
    // Download the image and convert to base64
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    let mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // Telegram often returns application/octet-stream — detect real MIME from magic bytes
    if (mimeType === 'application/octet-stream' || !mimeType.startsWith('image/')) {
      const bytes = new Uint8Array(imageBuffer.slice(0, 4));
      if (bytes[0] === 0xff && bytes[1] === 0xd8) mimeType = 'image/jpeg';
      else if (bytes[0] === 0x89 && bytes[1] === 0x50) mimeType = 'image/png';
      else if (bytes[0] === 0x47 && bytes[1] === 0x49) mimeType = 'image/gif';
      else if (bytes[0] === 0x52 && bytes[1] === 0x49) mimeType = 'image/webp';
      else mimeType = 'image/jpeg'; // fallback
    }

    const systemPrompt = `You are a verification assistant. Your job is to analyze an uploaded image and determine if it meets the requirements.

## Verification Task: "${stepLabel}"
## Requirements: ${verificationPrompt}

## Response Format (MUST follow exactly):
Respond ONLY with a JSON object, nothing else:
{"passed": true/false, "reason": "brief technical reason", "feedback": "friendly message in Myanmar/Burmese for the user"}

## Rules:
- If the image clearly shows the required proof → passed: true
- If the image is unclear, unrelated, or doesn't meet requirements → passed: false
- feedback should be encouraging and helpful, written in Myanmar language
- Be reasonably lenient — if it looks like a genuine attempt, pass it
- Keep reason in English, feedback in Myanmar`;

    const { HumanMessage } = await import('@langchain/core/messages');

    const message = new HumanMessage({
      content: [
        { type: 'text', text: systemPrompt },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` },
        },
      ],
    });

    const apiKey = await resolveApiKey(botId);
    const llmInstance = createLLM(apiKey);

    const response = await llmInstance.invoke([message]);
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        passed: !!result.passed,
        reason: result.reason || 'No reason provided',
        feedback: result.feedback || (result.passed ? '✅ စစ်ဆေးပြီးပါပြီ!' : '❌ ပြန်စစ်ပေးပါ။'),
      };
    }

    // Fallback if parsing fails
    return {
      passed: false,
      reason: 'Could not parse AI response',
      feedback: '⚠️ စစ်ဆေးမှု မအောင်မြင်ပါ။ ပြန်ပို့ပေးပါ။',
    };
  } catch (err) {
    console.error('Image verification error:', err);
    return {
      passed: false,
      reason: `Verification error: ${err}`,
      feedback: '⚠️ စစ်ဆေးရာမှာ အမှားတစ်ခု ဖြစ်သွားပါတယ်။ ပြန်ပို့ပေးပါ။',
    };
  }
}
