import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { botId } = await params;
    const bot = await prisma.bot.findFirst({
      where: { id: botId, userId: session.user.id },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const webhookUrl = (bot as any).n8nWebhookUrl;
    if (!webhookUrl) {
      return NextResponse.json({ error: 'No n8n webhook URL configured' }, { status: 400 });
    }

    // Send a test ping to the n8n webhook
    const testPayload = {
      test: true,
      botId: bot.id,
      botName: bot.name,
      timestamp: new Date().toISOString(),
      message: 'Test connection from Chatbot Widget',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-page-access-token': bot.messengerPageToken || 'test-token',
        'x-page-id': bot.messengerPageId || 'test-page-id',
        'x-bot-id': bot.id,
      },
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        status: response.status,
        message: 'n8n webhook responded successfully',
      });
    } else {
      return NextResponse.json({
        success: false,
        status: response.status,
        message: `n8n webhook responded with status ${response.status}`,
      });
    }
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return NextResponse.json({
        success: false,
        message: 'Connection timed out after 10 seconds. Check if your n8n server is running.',
      }, { status: 408 });
    }

    return NextResponse.json({
      success: false,
      message: error?.message || 'Failed to connect to n8n webhook',
    }, { status: 500 });
  }
}
