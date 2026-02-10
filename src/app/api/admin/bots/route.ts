import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (currentUser?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bots = await prisma.bot.findMany({
      select: {
        id: true,
        name: true,
        primaryColor: true,
        createdAt: true,
        user: {
          select: { name: true, email: true },
        },
        _count: {
          select: { conversations: true, documents: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(bots);
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
