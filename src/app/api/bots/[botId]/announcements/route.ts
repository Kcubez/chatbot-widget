import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// GET /api/bots/[botId]/announcements
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const announcements = await prisma.announcement.findMany({
    where: { botId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { reads: true },
      },
    },
  });

  // Also get total old members for read ratio
  const totalOldMembers = await prisma.telegramMember.count({
    where: { botId, memberType: 'old' },
  });

  return NextResponse.json({ announcements, totalOldMembers });
}

// POST /api/bots/[botId]/announcements — create a new announcement
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const { title, content } = body;

  if (!title || !content) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: { botId, title, content },
  });

  return NextResponse.json({ announcement });
}
