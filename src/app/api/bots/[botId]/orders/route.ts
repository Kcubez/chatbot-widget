import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// GET /api/bots/[botId]/orders
export async function GET(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

// PATCH /api/bots/[botId]/orders — update order status
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;

  if (!id) return NextResponse.json({ error: 'Missing order id' }, { status: 400 });

  const order = await prisma.order.update({
    where: { id },
    data,
  });

  return NextResponse.json(order);
}
