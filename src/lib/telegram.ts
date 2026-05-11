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
  files?: { url: string; name: string }[]; // Optional file attachments (PDFs, DOCx, etc.) — sent as Telegram documents
  requireUpload?: boolean; // true = user must upload photo/file for verification
  verificationPrompt?: string; // AI prompt to verify the uploaded file
  uploadInstruction?: string; // Custom instruction shown to user
  requiredUploads?: number; // Number of uploads needed (default: 1, e.g. 2 for laptop+phone screenshots)
  // Scheduling: mutually exclusive — scheduledAt takes priority if both are set
  delayHours?: number; // Hours to wait after previous step completion before showing this step
  scheduledAt?: string; // ISO datetime — fixed schedule, step unlocks at this exact time
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
 * Retry wrapper for fetch — handles transient network errors (ECONNRESET, etc.)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error: any) {
      const isNetworkError =
        error?.cause?.code === 'ECONNRESET' ||
        error?.cause?.code === 'ETIMEDOUT' ||
        error?.cause?.code === 'ENOTFOUND' ||
        error?.message?.includes('fetch failed');

      if (isNetworkError && attempt < retries) {
        console.warn(`Telegram fetch retry ${attempt + 1}/${retries} after network error`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // 1s, 2s backoff
        continue;
      }
      throw error;
    }
  }
  throw new Error('fetchWithRetry: exhausted retries');
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
): Promise<{ ok: boolean; result?: { message_id: number }; description?: string }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetchWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({ ok: false }));

  // If Markdown parsing fails, retry without parse_mode (plain text)
  if (
    !response.ok &&
    data?.error_code === 400 &&
    data?.description?.includes("can't parse entities")
  ) {
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

    const fallbackResponse = await fetchWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fallbackBody),
    });

    return await fallbackResponse.json().catch(() => ({ ok: false }));
  }

  return data;
}

/**
 * Pin a message in a Telegram chat
 */
export async function pinTelegramMessage(
  token: string,
  chatId: number | string,
  messageId: number,
  disableNotification: boolean = false
) {
  const response = await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      disable_notification: disableNotification,
    }),
  });

  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok) {
    console.error('Telegram pinChatMessage error:', data);
  }
  return data;
}

/**
 * Unpin a message in a Telegram chat.
 * If messageId is not provided, the most recent pinned message will be unpinned.
 */
export async function unpinTelegramMessage(
  token: string,
  chatId: number | string,
  messageId?: number
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
  };
  if (messageId) {
    body.message_id = messageId;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/unpinChatMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok) {
    // If it's already unpinned or not found, it might return 400, but we can log it
    console.warn('Telegram unpinChatMessage warning/error:', data);
  }
  return data;
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
 * Send a document (PDF, DOCX, etc.) via Telegram Bot API
 * Downloads the file first, then sends as multipart/form-data to preserve original filename
 */
export async function sendTelegramDocument(
  token: string,
  chatId: number | string,
  fileUrl: string,
  fileName: string,
  caption?: string
) {
  try {
    // Download the file from the URL
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      console.error(`Failed to download file: ${fileUrl}`);
      return null;
    }
    const fileBuffer = await fileResponse.arrayBuffer();

    // Create a FormData with the file blob to preserve filename
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('document', new Blob([fileBuffer]), fileName);
    if (caption) {
      formData.append('caption', caption);
    }

    const response = await fetchWithRetry(
      `https://api.telegram.org/bot${token}/sendDocument`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Telegram sendDocument error:', errData);
    }
    return response;
  } catch (err) {
    console.error('sendTelegramDocument failed:', err);
    return null;
  }
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
  await fetchWithRetry(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
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
 * Format a Date for Myanmar-friendly display (e.g. "May 5, 9:00 AM")
 */
export function formatAvailableAt(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Yangon',
  });
}

/**
 * Check if a step is available based on its scheduling configuration.
 * Returns whether the step can be shown now and when it will be available.
 */
export function isStepAvailable(
  topic: OnboardingTopic,
  previousCompletedAt: Date | null
): { available: boolean; availableAt: Date | null } {
  // No scheduling → immediately available
  if (!topic.scheduledAt && !topic.delayHours) {
    return { available: true, availableAt: null };
  }

  // Fixed schedule mode (takes priority)
  if (topic.scheduledAt) {
    const scheduledDate = new Date(topic.scheduledAt);
    return {
      available: new Date() >= scheduledDate,
      availableAt: scheduledDate,
    };
  }

  // Delay mode (relative to previous step completion)
  if (topic.delayHours && previousCompletedAt) {
    const availableAt = new Date(
      previousCompletedAt.getTime() + topic.delayHours * 60 * 60 * 1000
    );
    return {
      available: new Date() >= availableAt,
      availableAt,
    };
  }

  // Delay set but no previous completion yet → not available (first step with delay)
  if (topic.delayHours && !previousCompletedAt) {
    return { available: false, availableAt: null };
  }

  return { available: true, availableAt: null };
}

/**
 * Build progress summary text showing all steps with completion status
 * Now includes lock/schedule indicators for delayed steps
 */
export function buildProgressSummary(
  topics: OnboardingTopic[],
  completedTopicIds: Set<string>,
  stepAvailability?: Map<number, { available: boolean; availableAt: Date | null }>
): string {
  return topics
    .map((topic, i) => {
      const done = completedTopicIds.has(topic.id);
      if (done) {
        return `✅ Step ${i + 1}: ${topic.icon} ${topic.label}`;
      }

      // Check if step is locked
      const availability = stepAvailability?.get(i);
      if (availability && !availability.available) {
        const timeStr = availability.availableAt
          ? ` (${formatAvailableAt(availability.availableAt)})`
          : '';
        return `🔒 Step ${i + 1}: ${topic.icon} ${topic.label}${timeStr}`;
      }

      return `⬜ Step ${i + 1}: ${topic.icon} ${topic.label}`;
    })
    .join('\n');
}
