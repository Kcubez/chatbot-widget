/**
 * Telegram Bot API helper functions for First Day Pro onboarding feature
 */

export interface OnboardingTopic {
  id: string;
  icon: string;
  label: string;
  prompt: string; // AI prompt (used when useAI is true)
  content?: string; // Direct message content (used when useAI is false)
  buttonText?: string; // Custom completion button text (default: "ပြီးပါပြီ")
  useAI?: boolean; // true = AI generates response, false = send content directly
  images?: string[]; // Optional image URLs to send with this step
  requireUpload?: boolean; // true = user must upload photo/file for verification
  verificationPrompt?: string; // AI prompt to verify the uploaded file
}

/**
 * Get the download URL of a file uploaded to Telegram
 */
export async function getTelegramFileUrl(token: string, fileId: string): Promise<string | null> {
  const res = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.ok || !data.result?.file_path) return null;

  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

/**
 * Send a text message via Telegram Bot API
 * Tries Markdown first, falls back to plain text if Telegram can't parse it
 */
export async function sendTelegramMessage(
  token: string,
  chatId: number | string,
  text: string,
  replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] }
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // If Markdown parsing fails, retry without parse_mode (plain text)
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));

    if (errData?.error_code === 400 && errData?.description?.includes("can't parse entities")) {
      console.warn('Telegram Markdown parse failed, retrying as plain text...');

      // Strip markdown formatting for clean plain text
      const plainText = text
        .replace(/\*([^*]+)\*/g, '$1') // Remove *bold*
        .replace(/_([^_]+)_/g, '$1'); // Remove _italic_

      const fallbackBody: Record<string, unknown> = {
        chat_id: chatId,
        text: plainText,
      };

      if (replyMarkup) {
        fallbackBody.reply_markup = replyMarkup;
      }

      const fallbackResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallbackBody),
      });

      if (!fallbackResponse.ok) {
        const fallbackErr = await fallbackResponse.json().catch(() => ({}));
        console.error('Telegram sendMessage fallback error:', fallbackErr);
      }

      return fallbackResponse;
    }

    console.error('Telegram sendMessage error:', errData);
  }

  return response;
}

/**
 * Send photos via Telegram Bot API.
 * - 1 photo  → sendPhoto
 * - 2+ photos → sendMediaGroup (album, grouped like friend sending photos)
 */
export async function sendTelegramPhotos(
  token: string,
  chatId: number | string,
  photoUrls: string[],
  caption?: string
) {
  if (photoUrls.length === 0) return;

  if (photoUrls.length === 1) {
    // Single photo
    const body: Record<string, unknown> = {
      chat_id: chatId,
      photo: photoUrls[0],
    };
    if (caption) body.caption = caption;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Telegram sendPhoto error:', errData);
    }
    return response;
  }

  // Multiple photos → Media Group (album)
  const media = photoUrls.map((url, i) => ({
    type: 'photo',
    media: url,
    // Caption only on first photo
    ...(i === 0 && caption ? { caption } : {}),
  }));

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      media,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    console.error('Telegram sendMediaGroup error:', errData);
  }
  return response;
}

/**
 * Send typing indicator
 */
export async function sendTypingIndicator(token: string, chatId: number | string) {
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action: 'typing',
    }),
  });
}

/**
 * Answer a callback query (removes the "loading" state from the button)
 */
export async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || '',
    }),
  });
}

/**
 * Build inline keyboard from onboarding topics (menu mode)
 * Creates a 2-column grid layout for the buttons
 */
export function buildTopicsKeyboard(topics: OnboardingTopic[]): {
  inline_keyboard: InlineKeyboardButton[][];
} {
  const keyboard: InlineKeyboardButton[][] = [];

  for (let i = 0; i < topics.length; i += 2) {
    const row: InlineKeyboardButton[] = [
      {
        text: `${topics[i].icon} ${topics[i].label}`,
        callback_data: `onboarding:${topics[i].id}`,
      },
    ];

    // Add second button in the row if exists
    if (topics[i + 1]) {
      row.push({
        text: `${topics[i + 1].icon} ${topics[i + 1].label}`,
        callback_data: `onboarding:${topics[i + 1].id}`,
      });
    }

    keyboard.push(row);
  }

  return { inline_keyboard: keyboard };
}

/**
 * Build step-by-step keyboard: "▶️ Preview Step" button with topic name
 */
export function buildStartStepKeyboard(
  topicId: string,
  topicIcon?: string,
  topicLabel?: string
): {
  inline_keyboard: InlineKeyboardButton[][];
} {
  const buttonText =
    topicIcon && topicLabel ? `▶️ ${topicIcon} ${topicLabel}` : '▶️ ဖတ်ရန် / ကြည့်ရန်';

  return {
    inline_keyboard: [
      [
        {
          text: buttonText,
          callback_data: `onboarding:${topicId}`,
        },
      ],
    ],
  };
}

/**
 * Build "Complete & Next Step" keyboard after reading content
 */
export function buildCompleteStepKeyboard(
  topicId: string,
  buttonText?: string
): {
  inline_keyboard: InlineKeyboardButton[][];
} {
  return {
    inline_keyboard: [
      [
        {
          text: buttonText || '✅ ပြီးပါပြီ, နောက်တစ်ဆင့်သွားမည်',
          callback_data: `complete:${topicId}`,
        },
      ],
    ],
  };
}

/**
 * Build progress summary text showing all steps with completion status
 */
export function buildProgressSummary(
  topics: OnboardingTopic[],
  completedTopicIds: Set<string>
): string {
  return topics
    .map((topic, i) => {
      const done = completedTopicIds.has(topic.id);
      return `${done ? '✅' : '⬜'} Step ${i + 1}: ${topic.icon} ${topic.label}`;
    })
    .join('\n');
}
