/**
 * Facebook Messenger API helper functions
 */

const LOAD_TEST_RECIPIENT_PREFIX = 'load_test_';
// Meta accepts at most 2,000 characters in message.text. Leave room for
// Unicode edge cases and split at a natural newline/space whenever possible.
const MESSENGER_TEXT_CHUNK_SIZE = 1_800;

function isLoadTestRecipient(recipientId: string) {
  // Meta PSIDs are numeric. This prefix lets synthetic traffic exercise the
  // application and database without calling the real Messenger Send API.
  return recipientId.startsWith(LOAD_TEST_RECIPIENT_PREFIX);
}

function splitMessengerText(text: string) {
  if (text.length <= MESSENGER_TEXT_CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MESSENGER_TEXT_CHUNK_SIZE) {
    const window = remaining.slice(0, MESSENGER_TEXT_CHUNK_SIZE + 1);
    const newline = window.lastIndexOf('\n');
    const space = window.lastIndexOf(' ');
    const boundary = Math.max(newline, space);
    const end = boundary > MESSENGER_TEXT_CHUNK_SIZE / 2 ? boundary + 1 : MESSENGER_TEXT_CHUNK_SIZE;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendTextChunk(pageToken: string, recipientId: string, text: string) {
  return fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    }
  );
}

/** Returns the Page-scoped profile name when Meta makes it available. */
export async function getMessengerCustomerName(pageToken: string, recipientId: string) {
  if (isLoadTestRecipient(recipientId)) return null;
  try {
    const params = new URLSearchParams({ fields: 'first_name,last_name', access_token: pageToken });
    const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(recipientId)}?${params}`);
    if (!response.ok) return null;
    const profile = await response.json() as { first_name?: string; last_name?: string };
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    return name || null;
  } catch {
    return null;
  }
}

export async function sendMessengerMessage(pageToken: string, recipientId: string, text: string) {
  if (isLoadTestRecipient(recipientId)) return;
  for (const chunk of splitMessengerText(text)) {
    const res = await sendTextChunk(pageToken, recipientId, chunk);
    if (!res.ok) console.error('Messenger send error:', await res.text());
  }
}

export async function sendMessengerTyping(
  pageToken: string,
  recipientId: string,
  action: 'typing_on' | 'typing_off' = 'typing_on'
) {
  if (isLoadTestRecipient(recipientId)) return;
  await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: action,
    }),
  });
}

export async function sendMessengerQuickReplies(
  pageToken: string,
  recipientId: string,
  text: string,
  replies: { title: string; payload: string }[]
) {
  if (isLoadTestRecipient(recipientId)) return;
  const chunks = splitMessengerText(text);
  // Only the final part gets buttons, so customers can read every part and
  // still continue through the same flow.
  for (const chunk of chunks.slice(0, -1)) {
    const plainResponse = await sendTextChunk(pageToken, recipientId, chunk);
    if (!plainResponse.ok) console.error('Messenger send error:', await plainResponse.text());
  }
  const finalText = chunks.at(-1) || '';
  const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        text: finalText,
        quick_replies: replies.map(r => ({
          content_type: 'text',
          title: r.title,
          payload: r.payload,
        })),
      },
    }),
  });
  if (!res.ok) {
    // A failed quick-reply payload should not make the customer receive no answer.
    // Send the final chunk without buttons and expose Meta's reason in runtime logs.
    console.error('Messenger quick-reply send error:', await res.text());
    await sendMessengerMessage(pageToken, recipientId, finalText);
  }
}

/** Send public image URLs as Messenger image attachments. */
export async function sendMessengerImages(
  pageToken: string,
  recipientId: string,
  imageUrls: string[]
) {
  if (isLoadTestRecipient(recipientId)) return;
  for (const imageUrl of imageUrls) {
    const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'image',
            payload: { url: imageUrl, is_reusable: true },
          },
        },
      }),
    });
    if (!res.ok) console.error('Messenger image send error:', await res.text());
  }
}

export async function sendMessengerButtons(
  pageToken: string,
  recipientId: string,
  text: string,
  buttons: { type: string; title: string; payload?: string; url?: string }[]
) {
  if (isLoadTestRecipient(recipientId)) return;
  await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text,
            buttons: buttons.slice(0, 3),
          },
        },
      },
    }),
  });
}

export async function sendMessengerGenericTemplate(
  pageToken: string,
  recipientId: string,
  elements: {
    title: string;
    subtitle?: string;
    image_url?: string;
    buttons?: { type: string; title: string; payload?: string; url?: string }[];
  }[]
) {
  if (isLoadTestRecipient(recipientId)) return;
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: elements.slice(0, 10).map(el => ({
                title: el.title,
                subtitle: el.subtitle,
                image_url: el.image_url,
                buttons: el.buttons ? el.buttons.slice(0, 3) : undefined,
              })),
            },
          },
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    console.error('Messenger generic template send error:', err);
  }
}
