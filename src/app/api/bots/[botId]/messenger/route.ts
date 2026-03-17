import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// PATCH — update messenger settings for a bot
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;
  const body = await req.json();

  // Only allow specific fields
  const allowedFields = [
    'messengerPageToken',
    'messengerPageId',
    'messengerVerifyToken',
    'messengerAppSecret',
    'messengerEnabled',
    'googleSheetId',
    'googleSheetName',
    'messengerWelcomeMessage',
    'messengerContactMessage',
    'messengerPaymentMessage',
  ];

  const data: any = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  const updated = await prisma.bot.update({
    where: { id: botId },
    data,
  });

  return NextResponse.json({ success: true, bot: updated });
}
