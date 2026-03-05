import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// GET /api/bots/[botId]/products
export async function GET(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;
  const products = await prisma.product.findMany({
    where: { botId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(products);
}

// POST /api/bots/[botId]/products — create single or bulk (CSV import)
export async function POST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;
  const body = await req.json();

  // Bulk import (array)
  if (Array.isArray(body)) {
    const products = await prisma.product.createMany({
      data: body.map((p: any) => ({
        botId,
        name: p.name || 'Unnamed',
        price: parseFloat(p.price) || 0,
        category: p.category || 'General',
        stockCount: parseInt(p.stockCount || p.stock_count || '0') || 0,
        image: p.image || null,
        description: p.description || null,
        isActive: true,
      })),
    });
    return NextResponse.json({ created: products.count });
  }

  // Single create
  const product = await prisma.product.create({
    data: {
      botId,
      name: body.name,
      price: parseFloat(body.price) || 0,
      category: body.category || 'General',
      stockCount: parseInt(body.stockCount) || 0,
      image: body.image || null,
      description: body.description || null,
    },
  });

  return NextResponse.json(product);
}

// PATCH /api/bots/[botId]/products — update a product
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;

  if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

  const product = await prisma.product.update({
    where: { id },
    data,
  });

  return NextResponse.json(product);
}

// DELETE /api/bots/[botId]/products
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
