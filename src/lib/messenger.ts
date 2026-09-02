/**
 * Facebook Messenger API helper functions
 */

const LOAD_TEST_RECIPIENT_PREFIX = 'load_test_';

function isLoadTestRecipient(recipientId: string) {
  // Meta PSIDs are numeric. This prefix lets synthetic traffic exercise the
  // application and database without calling the real Messenger Send API.
  return recipientId.startsWith(LOAD_TEST_RECIPIENT_PREFIX);
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
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    }
  );
  if (!res.ok) {
    console.error('Messenger send error:', await res.text());
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
  const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        text,
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
    // Send the same text without buttons and expose Meta's reason in runtime logs.
    console.error('Messenger quick-reply send error:', await res.text());
    await sendMessengerMessage(pageToken, recipientId, text);
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
