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
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, status } = body;

  const order = await prisma.order.update({
    where: { id },
    data: { status },
  });
  return NextResponse.json(order);
}
