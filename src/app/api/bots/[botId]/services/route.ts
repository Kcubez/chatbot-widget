import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// Services are stored in the Product table with productType='service'
// This separates them completely from ecommerce products (productType='product')

// GET — list services for this bot
export async function GET(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const services = await prisma.product.findMany({
    where: { botId, productType: 'service' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      price: true,
      category: true,
      description: true,
      isActive: true,
    },
  });
  return NextResponse.json(services);
}

// POST — create a service
export async function POST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;
  const body = await req.json();

  const service = await prisma.product.create({
    data: {
      botId,
      name: body.name,
      price: parseFloat(body.price) || 0,  // 0 = free / inquiry
      category: body.category || 'General',
      stockCount: 0,         // services have no stock
      image: null,           // services have no image
      description: body.description || null,
      productType: 'service',
    },
  });
  return NextResponse.json(service);
}

// PATCH — update a service
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;

  // Strip any image/stock/productType fields to keep services clean, but ALLOW price
  const { image, stockCount, productType, ...safeData } = data;

  const service = await prisma.product.update({
    where: { id },
    data: {
      ...safeData,
      price: safeData.price ? parseFloat(safeData.price) : undefined,
    },
  });
  return NextResponse.json(service);
}

// DELETE — delete a service
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
