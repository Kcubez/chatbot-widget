import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendMessengerMessage, sendMessengerQuickReplies } from '@/lib/messenger';

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
    await sendMessengerQuickReplies(bot.messengerPageToken, registration.messengerSenderId, `Admin Team မှ စစ်ဆေးပြီးပါပြီရှင့်။\n\n📅 ${scheduleText.trim()}\n\nအထက်ပါ အတန်းချိန် အဆင်ပြေပါသလားရှင့်။`, [
      { title: '✅ အဆင်ပြေပါတယ်', payload: `EDU_SCHEDULE_OK_${id}` },
      { title: '↩️ အခြားအချိန်', payload: `EDU_SCHEDULE_CHANGE_${id}` },
    ]);
    return NextResponse.json({ registration: updated });
  }

  if (action === 'mark_unavailable') {
    const note = adminNote?.trim() || 'လက်ရှိတွင် အတန်းလက်ခံနိုင်ခြင်း မရှိသေးပါရှင့်။';
    const updated = await prisma.educationRegistration.update({ where: { id }, data: { status: 'not_available', adminNote: note } });
    await sendMessengerMessage(bot.messengerPageToken, registration.messengerSenderId, `Admin Team မှ စစ်ဆေးပြီးပါပြီရှင့်။ ${note}`);
    return NextResponse.json({ registration: updated });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
