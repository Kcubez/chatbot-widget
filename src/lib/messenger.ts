/**
 * Facebook Messenger API helper functions
 */

// Send a text message to a user
export async function sendMessengerMessage(pageToken: string, recipientId: string, text: string) {
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
    const err = await res.json();
    console.error('Messenger send error:', err);
  }
}

// Send typing indicator
export async function sendMessengerTyping(
  pageToken: string,
  recipientId: string,
  action: 'typing_on' | 'typing_off' = 'typing_on'
) {
  await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: action,
    }),
  });
}

// Send a message with quick reply buttons
export async function sendMessengerQuickReplies(
  pageToken: string,
  recipientId: string,
  text: string,
  replies: { title: string; payload: string }[]
) {
  await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
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
}

// Send a generic template (card with image, title, buttons)
export async function sendMessengerCard(
  pageToken: string,
  recipientId: string,
  elements: {
    title: string;
    subtitle?: string;
    image_url?: string;
    buttons?: { type: string; title: string; payload?: string; url?: string }[];
  }[]
) {
  await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: elements.slice(0, 10), // Max 10 elements
          },
        },
      },
    }),
  });
}

// Send a button template
export async function sendMessengerButtons(
  pageToken: string,
  recipientId: string,
  text: string,
  buttons: { type: string; title: string; payload?: string; url?: string }[]
) {
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
            buttons: buttons.slice(0, 3), // Max 3 buttons
          },
        },
      },
    }),
  });
}
