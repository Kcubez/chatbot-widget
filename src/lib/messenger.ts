/**
 * Facebook Messenger API helper functions
 */

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
