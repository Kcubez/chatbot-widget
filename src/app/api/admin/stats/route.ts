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

    const [totalUsers, totalBots, totalConversations, totalMessages, totalDocuments, recentUsers] =
      await Promise.all([
        prisma.user.count(),
        prisma.bot.count(),
        prisma.conversation.count(),
        prisma.message.count(),
        prisma.document.count(),
        prisma.user.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            _count: { select: { bots: true } },
          },
        }),
      ]);

    return NextResponse.json({
      totalUsers,
      totalBots,
      totalConversations,
      totalMessages,
      totalDocuments,
      recentUsers,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
