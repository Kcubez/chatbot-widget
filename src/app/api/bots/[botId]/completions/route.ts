import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { botId } = await params;

    // Verify bot ownership
    const bot = await prisma.bot.findUnique({
      where: { id: botId, userId: session.user.id },
      select: { id: true, onboardingTopics: true },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Fetch all completions for this bot
    const completions = await prisma.onboardingCompletion.findMany({
      where: { botId },
      orderBy: { completedAt: 'desc' },
    });

    // Group by user
    const userMap = new Map<
      string,
      {
        telegramChatId: string;
        telegramUsername: string | null;
        completedTopics: { topicId: string; topicLabel: string; completedAt: Date }[];
      }
    >();

    for (const c of completions) {
      if (!userMap.has(c.telegramChatId)) {
        userMap.set(c.telegramChatId, {
          telegramChatId: c.telegramChatId,
          telegramUsername: c.telegramUsername,
          completedTopics: [],
        });
      }
      userMap.get(c.telegramChatId)!.completedTopics.push({
        topicId: c.topicId,
        topicLabel: c.topicLabel,
        completedAt: c.completedAt,
      });
    }

    const topics = (bot.onboardingTopics as any[]) || [];
    const totalTopics = topics.length;

    const users = Array.from(userMap.values()).map(user => ({
      ...user,
      completedCount: user.completedTopics.length,
      totalTopics,
      isComplete: user.completedTopics.length >= totalTopics,
    }));

    return NextResponse.json({
      users,
      totalTopics,
      totalUsers: users.length,
      fullyCompleted: users.filter(u => u.isComplete).length,
    });
  } catch (err) {
    console.error('Fetch completions error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
