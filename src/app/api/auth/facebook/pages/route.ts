import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

type PendingSelection = { botId: string; pages: { id: string; name: string; accessToken: string }[] };

async function getSelection(req: NextRequest): Promise<PendingSelection | null> {
  const raw = req.cookies.get('facebook_page_selection')?.value;
  if (!raw) return null;
  try { return JSON.parse(raw) as PendingSelection; } catch { return null; }
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const selection = await getSelection(req);
  if (!session || !selection) return NextResponse.json({ error: 'Page selection expired' }, { status: 400 });
  const bot = await prisma.bot.findFirst({ where: { id: selection.botId, userId: session.user.id } });
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  return NextResponse.json({ pages: selection.pages.map(({ id, name }) => ({ id, name })) });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const selection = await getSelection(req);
  const { pageId } = await req.json();
  if (!session || !selection) return NextResponse.json({ error: 'Page selection expired. Please reconnect.' }, { status: 400 });
  const page = selection.pages.find(item => item.id === pageId);
  const bot = await prisma.bot.findFirst({ where: { id: selection.botId, userId: session.user.id } });
  if (!bot || !page) return NextResponse.json({ error: 'Invalid page selection' }, { status: 400 });
  const verifyToken = `vt_${bot.id}_${Date.now().toString(36)}`;
  await prisma.bot.update({ where: { id: bot.id }, data: { messengerPageToken: page.accessToken, messengerPageId: page.id, messengerVerifyToken: verifyToken, messengerEnabled: true } });
  await fetch(`https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${page.accessToken}`, { method: 'POST' });
  const response = NextResponse.json({ success: true, pageName: page.name });
  response.cookies.set('facebook_page_selection', '', { httpOnly: true, maxAge: 0, path: '/' });
  return response;
}
