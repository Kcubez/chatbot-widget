import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { embedAllDocuments } from '@/lib/rag';

/**
 * POST /api/bots/[botId]/embed
 * Batch-embed all documents for a bot.
 * Used for initial migration of existing documents to the vector store.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { botId } = await params;

    // Verify ownership
    const bot = await prisma.bot.findUnique({
      where: { id: botId, userId: session.user.id },
      include: { user: { select: { googleApiKey: true } } },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const apiKey = bot.user?.googleApiKey || process.env.GOOGLE_API_KEY || '';
    const result = await embedAllDocuments(botId, apiKey);

    return NextResponse.json({
      success: true,
      message: `Embedded ${result.total} documents into ${result.chunks} chunks`,
      ...result,
    });
  } catch (error) {
    console.error('Batch embed error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
