import { NextRequest, NextResponse } from 'next/server';

/**
 * Facebook OAuth callback handler.
 * Facebook redirects here after the user authorizes.
 * Query params: code (auth code), state (botId)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const botId = searchParams.get('state'); // botId passed as state
  const error = searchParams.get('error');

  // Build dashboard URL for redirect
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const dashboardUrl = `${baseUrl}/dashboard/bots/${botId}`;

  if (error || !code || !botId) {
    console.error('Facebook OAuth error:', error);
    return NextResponse.redirect(`${dashboardUrl}?fb_error=cancelled`);
  }

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.redirect(`${dashboardUrl}?fb_error=not_configured`);
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/facebook/callback`;

  try {
    // Step 1: Exchange code for access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error);
      return NextResponse.redirect(`${dashboardUrl}?fb_error=token_exchange`);
    }

    const userAccessToken = tokenData.access_token;

    // Step 2: Exchange for long-lived token
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userAccessToken}`
    );
    const longLivedData = await longLivedRes.json();
    const longLivedToken = longLivedData.access_token || userAccessToken;

    // Step 3: Get user's pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return NextResponse.redirect(`${dashboardUrl}?fb_error=no_pages`);
    }

    // Keep the page tokens server-side until the dashboard user chooses a page.
    const response = NextResponse.redirect(`${dashboardUrl}?fb_select_page=1`);
    response.cookies.set('facebook_page_selection', JSON.stringify({
      botId,
      pages: pagesData.data.map((page: { id: string; name: string; access_token: string }) => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
      })),
    }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' });
    return response;
  } catch (err: any) {
    console.error('Facebook OAuth callback error:', err);
    return NextResponse.redirect(`${dashboardUrl}?fb_error=server_error`);
  }
}
