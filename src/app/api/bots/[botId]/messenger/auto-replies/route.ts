import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

type Params = { params: Promise<{ botId: string }> };

async function authorize(botId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.userId !== session.user.id) return null;
  return bot;
}

/** GET  – list all auto-replies for a bot */
export async function GET(_req: NextRequest, { params }: Params) {
  const { botId } = await params;
  const bot = await authorize(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const replies = await prisma.messengerAutoReply.findMany({
    where: { botId },
    orderBy: { sortOrder: 'asc' },
  });
  return NextResponse.json({ replies, messengerMode: bot.messengerMode });
}

/** POST – create a new auto-reply rule */
export async function POST(req: NextRequest, { params }: Params) {
  const { botId } = await params;
  const bot = await authorize(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { keyword, reply } = await req.json();
  if (!keyword?.trim() || !reply?.trim()) {
    return NextResponse.json({ error: 'keyword and reply are required' }, { status: 400 });
  }

  const rule = await prisma.messengerAutoReply.create({
    data: { botId, keyword: keyword.trim(), reply: reply.trim() },
  });
  return NextResponse.json({ rule });
}

/** PATCH – update messenger mode OR a single rule */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { botId } = await params;
  const bot = await authorize(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Update bot mode
  if (body.messengerMode !== undefined) {
    const updated = await prisma.bot.update({
      where: { id: botId },
      data: { messengerMode: body.messengerMode },
    });
    return NextResponse.json({ messengerMode: updated.messengerMode });
  }

  // Update a single rule
  if (body.ruleId) {
    const rule = await prisma.messengerAutoReply.update({
      where: { id: body.ruleId },
      data: {
        ...(body.keyword !== undefined && { keyword: body.keyword }),
        ...(body.reply !== undefined && { reply: body.reply }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return NextResponse.json({ rule });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}

/** DELETE – delete a rule by ruleId query param */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { botId } = await params;
  const bot = await authorize(botId);
  if (!bot) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ruleId = searchParams.get('ruleId');
  if (!ruleId) return NextResponse.json({ error: 'ruleId required' }, { status: 400 });

  await prisma.messengerAutoReply.delete({ where: { id: ruleId } });
  return NextResponse.json({ success: true });
}
