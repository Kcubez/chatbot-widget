import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const body = await req.json();
    const { psid, date, time } = body;

    if (!psid || !date || !time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Find or create session for this user
    let session = await prisma.messengerSession.findFirst({
      where: { botId, messengerSenderId: psid },
    });

    if (!session) {
      session = await prisma.messengerSession.create({
        data: { botId, messengerSenderId: psid, state: 'browsing' },
      });
    }

    // 2. Update session with booking data and move to collecting personal info
    await prisma.messengerSession.update({
      where: { id: session.id },
      data: {
        state: 'collecting_name',
        pendingData: {
          appointmentDate: date,
          appointmentTime: time,
          type: 'appointment_booking'
        }
      }
    });

    // 3. Fetch bot to get token for notification
    const bot = await prisma.bot.findUnique({ where: { id: botId } });
    if (bot && bot.messengerPageToken) {
       // We can trigger a follow-up message from here if we want or let the user close webview
       // In a real production app, we usually send an async message via Messenger API here
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('WebView Submit Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
