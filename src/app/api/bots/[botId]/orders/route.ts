import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// GET — list orders
export async function GET(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const orders = await prisma.order.findMany({
    where: {
      botId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(orders);
}

// PATCH — update order status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, status } = body;

  const order = await prisma.order.update({
    where: { id },
    data: { status },
    include: { bot: true },
  });

  // If status is confirmed and it's a messenger order, send notification
  if (status === 'confirmed' && order.messengerSenderId && order.bot.messengerPageToken) {
    try {
      const isAppointment = order.bot.botType === 'appointment';
      
      let message = '';
      if (isAppointment) {
        message = `✅ သင့်ရဲ့ရက်ချိန်းကို အတည်ပြုပြီးပါပြီ!\n\n👤 အမည်: ${order.customerName}\n📅 ရက်စွဲ/အချိန်: ${order.customerTownship || '-'}\n\nကျေးဇူးတင်ပါတယ်။ 🙏`;
      } else {
        message = `✅ သင့်ရဲ့အော်ဒါကို အတည်ပြုပြီးပါပြီ!\n\nအော်ဒါနံပါတ်: #${order.id.slice(-6).toUpperCase()}\nပို့ဆောင်မည့်အခြေအနေကို ဆက်လက်အကြောင်းကြားပေးပါမည်။`;
      }

      await fetch(
        `https://graph.facebook.com/v21.0/me/messages?access_token=${order.bot.messengerPageToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: order.messengerSenderId },
            message: { text: message },
          }),
        }
      );
    } catch (err) {
      console.error('Failed to send status update notification:', err);
    }
  }

  return NextResponse.json(order);
}

// DELETE — remove order
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  await prisma.order.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
