import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { botId } = await params;
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sourceBotId = req.nextUrl.searchParams.get('sourceBotId');
  if (!sourceBotId) {
    const bots = await prisma.bot.findMany({
      where: { userId: session.user.id, id: { not: botId } },
      select: { id: true, name: true, botCategory: true, _count: { select: { products: { where: { productType: 'product' } } } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ bots });
  }
  const source = await prisma.bot.findFirst({ where: { id: sourceBotId, userId: session.user.id } });
  if (!source) return NextResponse.json({ error: 'Source bot not found' }, { status: 404 });
  const products = await prisma.product.findMany({
    where: { botId: sourceBotId, productType: 'product' },
    select: { id: true, name: true, price: true, category: true, stockCount: true, image: true, description: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { botId } = await params;
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sourceBotId, productIds } = await req.json();
  if (!sourceBotId || !Array.isArray(productIds) || productIds.length === 0) return NextResponse.json({ error: 'Choose at least one product' }, { status: 400 });
  const [target, source] = await Promise.all([
    prisma.bot.findFirst({ where: { id: botId, userId: session.user.id } }),
    prisma.bot.findFirst({ where: { id: sourceBotId, userId: session.user.id } }),
  ]);
  if (!target || !source || source.id === target.id) return NextResponse.json({ error: 'Invalid source or destination bot' }, { status: 400 });
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, botId: source.id, productType: 'product' } });
  const created = await prisma.product.createMany({ data: products.map(product => ({
    botId: target.id, name: product.name, price: product.price, category: product.category,
    stockCount: product.stockCount, image: product.image, description: product.description,
    isActive: product.isActive, productType: 'product',
  })) });
  return NextResponse.json({ created: created.count });
}
