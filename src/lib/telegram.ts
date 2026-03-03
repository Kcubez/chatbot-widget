/**
 * Telegram Bot API helper functions for First Day Pro onboarding feature
 */

export interface OnboardingTopic {
  id: string;
  icon: string;
  label: string;
  prompt: string;
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
 * Build inline keyboard from onboarding topics
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
 * Build the "back to menu" keyboard
 */
export function buildBackToMenuKeyboard(): {
  inline_keyboard: InlineKeyboardButton[][];
} {
  return {
    inline_keyboard: [
      [
        {
          text: '⬅️ Back to Menu',
          callback_data: 'onboarding:back_to_menu',
        },
      ],
    ],
  };
}
