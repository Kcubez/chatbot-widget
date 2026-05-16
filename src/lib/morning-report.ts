import { prisma } from '@/lib/prisma';
import { verifyMorningReportSubmission } from '@/lib/ai';
import { sendTelegramMessage } from '@/lib/telegram';

const TRAINING_DAYS = 7;
const MYANMAR_TIME_ZONE = 'Asia/Yangon';

type MorningReportBot = {
  id: string;
  telegramBotToken: string | null;
};

const db = prisma as any;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getMyanmarReportDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MYANMAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

export function isMyanmarSunday(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: MYANMAR_TIME_ZONE,
    weekday: 'short',
  }).format(date);

  return weekday === 'Sun';
}

export async function startMorningReportTraining(botId: string, telegramChatId: string) {
  const member = await db.telegramMember.findUnique({
    where: { botId_telegramChatId: { botId, telegramChatId } },
  });

  if (!member || member.memberType !== 'old' || member.registrationStep) return null;

  const now = new Date();
  return db.morningReportTraining.upsert({
    where: { memberId: member.id },
    create: {
      botId,
      memberId: member.id,
      startedAt: now,
      endsAt: addDays(now, TRAINING_DAYS),
      status: 'active',
    },
    update: {},
  });
}

export async function handleMorningReportSubmission(
  botId: string,
  telegramChatId: string,
  content: string
) {
  if (content.trim().startsWith('/')) return null;

  const training = await db.morningReportTraining.findFirst({
    where: {
      botId,
      status: 'active',
      endsAt: { gt: new Date() },
      member: { telegramChatId, registrationStep: null },
    },
    include: { member: true },
  });

  if (!training) return null;

  const reportDate = getMyanmarReportDate();
  const existing = await db.morningReportSubmission.findUnique({
    where: { trainingId_reportDate: { trainingId: training.id, reportDate } },
  });

  if (existing?.aiStatus === 'accepted') {
    return {
      handled: true,
      message:
        '✅ ဒီနေ့ Morning report တင်ပြီးသားပါ။ ပြင်ချင်ရင် report အသစ်ပြန်ပို့နိုင်ပါတယ်၊ HR ဘက်မှာ latest submission ကိုမြင်ရပါမယ်။',
    };
  }

  const result = await verifyMorningReportSubmission(content, botId);

  await db.morningReportSubmission.upsert({
    where: { trainingId_reportDate: { trainingId: training.id, reportDate } },
    create: {
      trainingId: training.id,
      reportDate,
      content,
      aiStatus: result.status,
      aiReason: result.reason,
      aiFeedback: result.feedback,
    },
    update: {
      content,
      aiStatus: result.status,
      aiReason: result.reason,
      aiFeedback: result.feedback,
      submittedAt: new Date(),
    },
  });

  return {
    handled: true,
    message:
      result.status === 'accepted'
        ? `✅ *Morning report လက်ခံပြီးပါပြီ!*\n\n${result.feedback}`
        : `📝 *Morning report ကို ပြန်ပြင်ပေးပါဦးနော်*\n\n${result.feedback}`,
  };
}

export async function completeExpiredMorningReportTrainings() {
  return db.morningReportTraining.updateMany({
    where: {
      status: 'active',
      endsAt: { lte: new Date() },
    },
    data: { status: 'completed' },
  });
}

export async function sendMorningReportAlerts() {
  if (isMyanmarSunday()) {
    return { skipped: true, reason: 'Sunday', sent: 0, failed: 0, completed: 0, total: 0 };
  }

  const completed = await completeExpiredMorningReportTrainings();
  const reportDate = getMyanmarReportDate();
  const trainings = await db.morningReportTraining.findMany({
    where: {
      status: 'active',
      endsAt: { gt: new Date() },
      member: {
        registrationStep: null,
        telegramChatId: { not: { startsWith: 'unverified_' } },
      },
    },
    include: {
      bot: true,
      member: true,
      submissions: {
        where: { reportDate, aiStatus: 'accepted' },
        take: 1,
      },
    },
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const training of trainings as Array<
    typeof trainings[number] & { bot: MorningReportBot }
  >) {
    if (!training.bot.telegramBotToken || training.submissions.length > 0) continue;

    const name = training.member.firstName || training.member.telegramUsername || 'Team member';
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(training.endsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    );

    try {
      const data = await sendTelegramMessage(
        training.bot.telegramBotToken,
        training.member.telegramChatId,
        `🌅 *Morning Report တင်ရန်အချိန်ပါ*\n\nမင်္ဂလာပါ ${name} ရေ၊ ဒီနေ့ Morning Report ကို *9:30 AM မတိုင်ခင်* အောက်က format အတိုင်းတင်ပေးပါနော်။\n\n*Morning*\n\n*Yesterday*\n- မနေ့ကလုပ်ခဲ့တဲ့ task\n\n*Today*\n- ဒီနေ့လုပ်မယ့် task\n\n*Problem*\n- အခက်အခဲရှိရင်ရေးပါ။ မရှိရင် Nth / None / မရှိပါ လို့ရေးပါ။\n\n*မှတ်ချက်*\n9:31 AM - 10:00 AM: နောက်ကျအဖြစ် မှတ်တမ်းဝင်ပါမယ်။\n10:00 AM ကျော်: Half day unpaid leave သတ်မှတ်ပါမယ်။\n12:30 PM ကျော်: Whole day unpaid leave သတ်မှတ်ပါမယ်။\n\n⏳ Training ကျန်ရက်: *${daysLeft}* ရက်`
      );

      if (data?.ok) sent++;
      else {
        failed++;
        errors.push(`${training.member.telegramChatId}: ${data?.description || 'Unknown error'}`);
      }
    } catch (err) {
      failed++;
      errors.push(`${training.member.telegramChatId}: ${String(err)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 150));
  }

  return {
    skipped: false,
    sent,
    failed,
    completed: completed.count,
    total: trainings.length,
    errors: errors.length ? errors : undefined,
  };
}
