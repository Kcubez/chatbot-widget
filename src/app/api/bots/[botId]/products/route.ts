import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

async function requireOwnedBot(botId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.bot.findFirst({ where: { id: botId, userId: session.user.id }, select: { id: true } });
}

// GET — list products (ecommerce only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const bot = await requireOwnedBot(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const products = await prisma.product.findMany({
    where: { botId, productType: 'product' },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(products);
}

// POST — create product(s)
export async function POST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const bot = await requireOwnedBot(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  // Bulk import (array)
  if (Array.isArray(body)) {
    const created = await prisma.product.createMany({
      data: body.map((p: any) => ({
        botId,
        name: p.name,
        price: parseFloat(p.price) || 0,
        category: p.category || 'General',
        stockCount: parseInt(p.stockCount || p.stock_count) || 0,
        image: p.image || null,
        description: p.description || null,
        productType: 'product',
      })),
    });
    return NextResponse.json({ created: created.count });
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
      productType: 'product',
    },
  });
  return NextResponse.json(product);
}

// PATCH — update product
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const bot = await requireOwnedBot(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { id, ...data } = body;
  const existing = await prisma.product.findFirst({ where: { id, botId, productType: 'product' }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const product = await prisma.product.update({
    where: { id },
    data,
  });
  return NextResponse.json(product);
}

// DELETE — delete product
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const bot = await requireOwnedBot(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const deleted = await prisma.product.deleteMany({ where: { id, botId, productType: 'product' } });
  if (deleted.count === 0) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
