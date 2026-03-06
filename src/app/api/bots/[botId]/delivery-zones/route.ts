import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// GET — list delivery zones
export async function GET(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const zones = await prisma.deliveryZone.findMany({
    where: { botId },
    orderBy: { township: 'asc' },
  });
  return NextResponse.json(zones);
}

// POST — create zone(s)
export async function POST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;
  const body = await req.json();

  if (Array.isArray(body)) {
    const created = await prisma.deliveryZone.createMany({
      data: body.map((z: any) => ({
        botId,
        township: z.township,
        city: z.city || '',
        fee: parseFloat(z.fee) || 0,
      })),
    });
    return NextResponse.json({ created: created.count });
  }

  const zone = await prisma.deliveryZone.create({
    data: {
      botId,
      township: body.township,
      city: body.city || '',
      fee: parseFloat(body.fee) || 0,
    },
  });
  return NextResponse.json(zone);
}

// PATCH — update zone
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;

  const zone = await prisma.deliveryZone.update({
    where: { id },
    data,
  });
  return NextResponse.json(zone);
}

// DELETE — delete zone
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await prisma.deliveryZone.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
