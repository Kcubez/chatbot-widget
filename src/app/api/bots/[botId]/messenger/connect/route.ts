import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// POST /api/bots/[botId]/messenger/connect — exchange short-lived token for long-lived page token
export async function POST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;
  const body = await req.json();
  const { userAccessToken, pageId, pageName } = body;

  if (!userAccessToken || !pageId) {
    return NextResponse.json({ error: 'Missing userAccessToken or pageId' }, { status: 400 });
  }

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'Facebook App not configured on server' }, { status: 500 });
  }

  try {
    // Step 1: Exchange short-lived user token for long-lived user token
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userAccessToken}`
    );
    const longLivedData = await longLivedRes.json();

    if (longLivedData.error) {
      console.error('Token exchange error:', longLivedData.error);
      return NextResponse.json({ error: 'Failed to exchange token' }, { status: 400 });
    }

    const longLivedUserToken = longLivedData.access_token;

    // Step 2: Get page access token using the long-lived user token
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=access_token,name&access_token=${longLivedUserToken}`
    );
    const pageData = await pagesRes.json();

    if (pageData.error) {
      console.error('Page token error:', pageData.error);
      return NextResponse.json({ error: 'Failed to get page token' }, { status: 400 });
    }

    const pageAccessToken = pageData.access_token;

    // Step 3: Generate a verify token
    const verifyToken = `vt_${botId}_${Date.now().toString(36)}`;

    // Step 4: Save to database
    await prisma.bot.update({
      where: { id: botId },
      data: {
        messengerPageToken: pageAccessToken,
        messengerPageId: pageId,
        messengerVerifyToken: verifyToken,
        messengerEnabled: true,
      },
    });

    // Step 5: Subscribe the page to webhook events
    try {
      await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${pageAccessToken}`,
        { method: 'POST' }
      );
    } catch (subErr) {
      console.error('Webhook subscription warning:', subErr);
    }

    return NextResponse.json({
      success: true,
      pageName: pageData.name || pageName,
      pageId,
      verifyToken,
    });
  } catch (error: any) {
    console.error('Connect error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/bots/[botId]/messenger/connect — disconnect page
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;

  await prisma.bot.update({
    where: { id: botId },
    data: {
      messengerPageToken: null,
      messengerPageId: null,
      messengerVerifyToken: null,
      messengerAppSecret: null,
      messengerEnabled: false,
    },
  });

  return NextResponse.json({ success: true });
}
