import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/admin/migrate-bot-categories
 *
 * One-time migration to fix old bots that were assigned 'website_bot' by
 * default before the botCategory field was introduced.
 *
 * Logic:
 *  - Has onboardingEnabled = true OR onboardingTopics set → 'first_day_pro'
 *  - Has messengerPageId set → 'messenger_sale'
 *  - Has telegramBotToken (but no onboarding) → 'first_day_pro'
 *    (before telegram_sale existed, any Telegram bot was first_day_pro)
 *  - Otherwise → keep as 'website_bot'
 *
 * Admin-only endpoint.
 */
export async function POST() {
  // ─── Auth Check ───────────────────────────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ─── Find all bots that have the default 'website_bot' category ──────────
  const bots = await prisma.bot.findMany({
    where: { botCategory: 'website_bot' },
    select: {
      id: true,
      name: true,
      botCategory: true,
      telegramBotToken: true,
      onboardingEnabled: true,
      onboardingTopics: true,
      messengerPageId: true,
    },
  });

  const results: { id: string; name: string; from: string; to: string }[] = [];
  let changedCount = 0;

  for (const bot of bots) {
    let newCategory = 'website_bot'; // default - no change

    const hasOnboarding =
      bot.onboardingEnabled ||
      (bot.onboardingTopics !== null &&
        bot.onboardingTopics !== undefined &&
        (bot.onboardingTopics as any[])?.length > 0);

    if (hasOnboarding) {
      // Onboarding is a First Day Pro feature
      newCategory = 'first_day_pro';
    } else if (bot.messengerPageId) {
      // Connected to Messenger → Messenger Sale Bot
      newCategory = 'messenger_sale';
    } else if (bot.telegramBotToken) {
      // Has Telegram token but no onboarding → was originally First Day Pro
      // (telegram_sale didn't exist when these were created)
      newCategory = 'first_day_pro';
    }

    if (newCategory !== bot.botCategory) {
      await prisma.bot.update({
        where: { id: bot.id },
        data: { botCategory: newCategory },
      });
      changedCount++;
    }

    results.push({
      id: bot.id,
      name: bot.name,
      from: bot.botCategory,
      to: newCategory,
    });
  }

  return NextResponse.json({
    message: `Migration complete. ${changedCount} bot(s) updated.`,
    totalScanned: bots.length,
    changedCount,
    results,
  });
}
