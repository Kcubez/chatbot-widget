import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { updateOwnedBot, MessengerPageConflictError } from '@/lib/messenger-page-connection';
import { headers } from 'next/headers';

// PATCH — update messenger settings for a bot
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { botId } = await params;
  const body = await req.json();

  // Only allow specific fields
  const allowedFields = [
    'messengerPageToken',
    'messengerPageId',
    'messengerVerifyToken',
    'messengerAppSecret',
    'messengerEnabled',
    'googleSheetId',
    'googleSheetName',
    'messengerWelcomeMessage',
    'messengerContactMessage',
    'messengerPaymentMessage',
    'messengerPaymentImages',
    'messengerPaymentReviewMessage',
    'messengerPaymentReviewFollowUpMessage',
    'educationCourseContent',
    'educationFaqContent',
    'educationFlowContent',
    'educationCourses',
    'botType',
    'messengerMenu',
  ];

  const data: any = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  try {
    const updated = await updateOwnedBot(botId, session.user.id, data);
    return NextResponse.json({ success: true, bot: updated });
  } catch (error) {
    if (error instanceof MessengerPageConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === 'Invalid Facebook Page ID') return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
