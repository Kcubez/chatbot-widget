import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendMessengerMessage, sendMessengerQuickReplies } from '@/lib/messenger';
import { getEducationFlowText } from '@/lib/education-registration';

async function getOwnedBot(botId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.bot.findFirst({ where: { id: botId, userId: session.user.id } });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const bot = await getOwnedBot(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const registrations = await prisma.educationRegistration.findMany({ where: { botId }, orderBy: { updatedAt: 'desc' } });
  return NextResponse.json({ registrations });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const bot = await getOwnedBot(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (bot.botCategory !== 'education_registration') return NextResponse.json({ error: 'Not an education registration bot' }, { status: 400 });

  const { id, action, scheduleText, adminNote } = await request.json();
  const registration = await prisma.educationRegistration.findFirst({ where: { id, botId } });
  if (!registration) return NextResponse.json({ error: 'Registration request not found' }, { status: 404 });
  if (!bot.messengerPageToken) return NextResponse.json({ error: 'Messenger is not connected' }, { status: 400 });

  if (action === 'offer_schedule') {
    if (!scheduleText?.trim()) return NextResponse.json({ error: 'Schedule text is required' }, { status: 400 });
    const updated = await prisma.educationRegistration.update({ where: { id }, data: { status: 'schedule_offered', scheduleText: scheduleText.trim(), adminNote: adminNote?.trim() || null } });
    await prisma.messengerSession.updateMany({
      where: { botId, messengerSenderId: registration.messengerSenderId },
      data: { state: 'education_schedule_offered', pendingData: { requestId: id } },
    });
    await sendMessengerQuickReplies(bot.messengerPageToken, registration.messengerSenderId, `${getEducationFlowText(bot, 'schedule_message_before')}\n\n📅 ${scheduleText.trim()}\n\n${getEducationFlowText(bot, 'schedule_message_after')}`, [
      { title: getEducationFlowText(bot, 'schedule_ok'), payload: `EDU_SCHEDULE_OK_${id}` },
      { title: getEducationFlowText(bot, 'schedule_change'), payload: `EDU_SCHEDULE_CHANGE_${id}` },
      { title: getEducationFlowText(bot, 'request_cancel'), payload: `EDU_CANCEL_REQUEST_${id}` },
    ]);
    return NextResponse.json({ registration: updated });
  }

  if (action === 'mark_unavailable') {
    const note = adminNote?.trim() || getEducationFlowText(bot, 'unavailable_default');
    const updated = await prisma.educationRegistration.update({ where: { id }, data: { status: 'not_available', adminNote: note } });
    await prisma.messengerSession.updateMany({
      where: { botId, messengerSenderId: registration.messengerSenderId },
      data: { state: 'browsing', pendingData: {} },
    });
    await sendMessengerMessage(bot.messengerPageToken, registration.messengerSenderId, `${getEducationFlowText(bot, 'schedule_message_before')} ${note}`);
    return NextResponse.json({ registration: updated });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const bot = await getOwnedBot(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Request id is required' }, { status: 400 });
  const registration = await prisma.educationRegistration.findFirst({ where: { id, botId } });
  if (!registration) return NextResponse.json({ error: 'Registration request not found' }, { status: 404 });

  const session = await prisma.messengerSession.findUnique({
    where: { botId_messengerSenderId: { botId, messengerSenderId: registration.messengerSenderId } },
  });
  const sessionRequestId = (session?.pendingData as { requestId?: string } | null)?.requestId;

  await prisma.$transaction(async tx => {
    await tx.educationRegistration.delete({ where: { id } });
    if (session && sessionRequestId === id) {
      await tx.messengerSession.update({ where: { id: session.id }, data: { state: 'browsing', pendingData: {} } });
    }
  });

  return NextResponse.json({ success: true });
}
