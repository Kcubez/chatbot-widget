import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// PATCH /api/bots/[botId]/messenger — update messenger config
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;
  const body = await req.json();

  const updateData: any = {};
  if (body.messengerPageToken !== undefined)
    updateData.messengerPageToken = body.messengerPageToken;
  if (body.messengerPageId !== undefined) updateData.messengerPageId = body.messengerPageId;
  if (body.messengerVerifyToken !== undefined)
    updateData.messengerVerifyToken = body.messengerVerifyToken;
  if (body.messengerAppSecret !== undefined)
    updateData.messengerAppSecret = body.messengerAppSecret;
  if (body.messengerEnabled !== undefined) updateData.messengerEnabled = body.messengerEnabled;
  if (body.googleSheetId !== undefined) updateData.googleSheetId = body.googleSheetId;
  if (body.googleSheetName !== undefined) updateData.googleSheetName = body.googleSheetName;

  const bot = await prisma.bot.update({
    where: { id: botId },
    data: updateData,
  });

  return NextResponse.json({
    messengerPageToken: bot.messengerPageToken ? '***configured***' : null,
    messengerPageId: bot.messengerPageId,
    messengerVerifyToken: bot.messengerVerifyToken,
    messengerEnabled: bot.messengerEnabled,
    googleSheetId: bot.googleSheetId,
    googleSheetName: bot.googleSheetName,
  });
}
