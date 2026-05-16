import { NextRequest, NextResponse } from 'next/server';
import { sendMorningReportAlerts } from '@/lib/morning-report';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    const xCronSecret = request.headers.get('x-cron-secret');
    const isAuthorized = authHeader === `Bearer ${cronSecret}` || xCronSecret === cronSecret;

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await sendMorningReportAlerts();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Morning report cron failed:', error);
    return NextResponse.json({ error: 'Morning report cron failed' }, { status: 500 });
  }
}
