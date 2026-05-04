import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateBotResponse, verifyUploadedImage, verifyTextSubmission } from '@/lib/ai';
import {
  sendTelegramMessage,
  sendTelegramPhotos,
  sendTypingIndicator,
  answerCallbackQuery,
  getTelegramFileUrl,
  buildStartStepKeyboard,
  buildCompleteStepKeyboard,
  buildProgressSummary,
  isStepAvailable,
  formatAvailableAt,
  OnboardingTopic,
} from '@/lib/telegram';
import { handleTelegramSaleUpdate } from '@/lib/telegram-sale';
import { handleTelegramAgenticSaleUpdate } from '@/lib/agentic-sale';

// ─────────────────────────────────────────────
// Helper: Register / update Telegram member
// ─────────────────────────────────────────────
async function registerMember(
  botId: string,
  chatId: string,
  from: {
    username?: string;
    first_name?: string;
    last_name?: string;
  },
  memberType?: string
) {
  try {
    const data: any = {
      telegramUsername: from.username || null,
      firstName: from.first_name || null,
      lastName: from.last_name || null,
    };
    if (memberType) {
      data.memberType = memberType;
    }

    return await prisma.telegramMember.upsert({
      where: { botId_telegramChatId: { botId, telegramChatId: chatId } },
      create: {
        botId,
        telegramChatId: chatId,
        memberType: memberType || 'new', // default to new
        ...data,
      },
      update: data,
    });
  } catch (err) {
    console.error('Failed to register member:', err);
    throw err;
  }
}

/**
 * Promotes a new member to "old" status after onboarding is complete.
 */
async function promoteToOldMember(botId: string, chatId: string) {
  try {
    await prisma.telegramMember.updateMany({
      where: { botId, telegramChatId: chatId, memberType: 'new' },
      data: { memberType: 'old' },
    });
    console.log(`User ${chatId} promoted to OLD member in bot ${botId}`);
  } catch (err) {
    console.error('Failed to promote member:', err);
  }
}

// ─────────────────────────────────────────────
// Helper: Get user's current step
// ─────────────────────────────────────────────
async function getUserCurrentStep(botId: string, chatId: string, topics: OnboardingTopic[]) {
  // Get all completed topic IDs for this user (with completedAt for scheduling)
  const completions = await prisma.onboardingCompletion.findMany({
    where: {
      botId,
      telegramChatId: chatId,
      completedAt: {
        gt: new Date(0), // Only count as completed if completedAt is NOT 1970-01-01
      },
    },
    select: { topicId: true, completedAt: true },
  });

  const completedIds = new Set(completions.map(c => c.topicId));

  // Build a map of topicId -> completedAt for scheduling lookups
  const completionDateMap = new Map<string, Date>();
  for (const c of completions) {
    completionDateMap.set(c.topicId, c.completedAt);
  }

  // Find the first topic that hasn't been completed (by order)
  const currentIndex = topics.findIndex(t => !completedIds.has(t.id));

  // Check scheduling for the current step
  let stepLocked = false;
  let availableAt: Date | null = null;

  if (currentIndex >= 0) {
    const currentTopic = topics[currentIndex];
    // Get previous step's completion date for delay calculation
    let previousCompletedAt: Date | null = null;
    if (currentIndex > 0) {
      const prevTopicId = topics[currentIndex - 1].id;
      previousCompletedAt = completionDateMap.get(prevTopicId) || null;
    }

    const availability = isStepAvailable(currentTopic, previousCompletedAt);
    stepLocked = !availability.available;
    availableAt = availability.availableAt;
  }

  // Build step availability map for progress summary
  const stepAvailabilityMap = new Map<number, { available: boolean; availableAt: Date | null }>();
  for (let i = 0; i < topics.length; i++) {
    if (completedIds.has(topics[i].id)) continue; // completed, skip
    let prevCompleted: Date | null = null;
    if (i > 0) {
      prevCompleted = completionDateMap.get(topics[i - 1].id) || null;
    }
    stepAvailabilityMap.set(i, isStepAvailable(topics[i], prevCompleted));
  }

  return {
    completedIds,
    completedCount: completedIds.size,
    currentIndex, // -1 if all completed
    currentTopic: currentIndex >= 0 ? topics[currentIndex] : null,
    isAllComplete: currentIndex === -1,
    isStepLocked: stepLocked,
    availableAt,
    stepAvailabilityMap,
  };
}

// ─────────────────────────────────────────────
// Helper: Send step card
// ─────────────────────────────────────────────
async function sendStepCard(
  token: string,
  chatId: number | string,
  topic: OnboardingTopic,
  stepNumber: number,
  totalSteps: number
) {
  const progressBar = Array.from({ length: totalSteps }, (_, i) =>
    i < stepNumber - 1 ? '🟢' : i === stepNumber - 1 ? '🔵' : '⚪'
  ).join('');

  const message = `📋 *Step ${stepNumber} / ${totalSteps}*\n${progressBar}\n\n${topic.icon} *${topic.label}*\n\nအောက်က button ကိုနှိပ်ပြီး ဖတ်ပါ / ကြည့်ပါ 👇`;

  await sendTelegramMessage(
    token,
    chatId,
    message,
    buildStartStepKeyboard(topic.id, topic.icon, topic.label)
  );
}

// ─────────────────────────────────────────────
// Helper: Post-Start Flow (Announcements & Onboarding)
// ─────────────────────────────────────────────
async function handlePostStartFlow(bot: any, token: string, chatId: number | string, member: any) {
  let isAllComplete = false;

  // 1. Check Onboarding Status (If Onboarding and NOT an old member)
  if (bot.onboardingEnabled && bot.onboardingTopics && member?.memberType !== 'old') {
    const topics = bot.onboardingTopics as unknown as OnboardingTopic[];

    if (topics.length > 0) {
      const progress = await getUserCurrentStep(bot.id, String(chatId), topics);
      isAllComplete = progress.isAllComplete;

      if (!isAllComplete) {
        // Send onboarding welcome
        const welcomeMessage =
          bot.onboardingWelcome ||
          `🎉 မှတ်ပုံတင်ခြင်း အောင်မြင်ပါတယ်။\n\n*${bot.name}* မှ ကြိုဆိုပါတယ်!\nOnboarding process ကို တစ်ဆင့်ချင်း လုပ်သွားပါမယ်။ 👇`;

        if (progress.completedCount > 0) {
          const summary = buildProgressSummary(topics, progress.completedIds, progress.stepAvailabilityMap);
          await sendTelegramMessage(
            token,
            chatId,
            `${welcomeMessage}\n\n📊 *Progress: ${progress.completedCount}/${topics.length}*\n\n${summary}\n\nနောက်တစ်ဆင့်ကို ဆက်လုပ်ပါ ⬇️`
          );
        } else {
          await sendTelegramMessage(token, chatId, welcomeMessage);
        }

        // Check if current step is locked by schedule
        if (progress.isStepLocked) {
          const timeStr = progress.availableAt
            ? formatAvailableAt(progress.availableAt)
            : 'နောက်မှ';
          await sendTelegramMessage(
            token,
            chatId,
            `🔒 *နောက်တစ်ဆင့်အတွက် ${timeStr} မှာ နောက်ပိုင်း /start နှိပ်ပြီး ဆက်လုပ်နိုင်ပါတယ်ရှင်* ✨`
          );
          return;
        }

        // Show current step card
        await sendStepCard(
          token,
          chatId,
          progress.currentTopic!,
          progress.currentIndex + 1,
          topics.length
        );
        return; // Stop here, wait for them to complete the step
      }
    }
  }

  // 2. The user is EITHER:
  //    - An Old Member
  //    - A New Member who has completed ALL onboarding
  //    - Onboarding is turned off / no topics exist

  // Check for new unseen announcements to alert them
  const latestAnnouncement = await prisma.announcement.findFirst({
    where: { botId: bot.id, isSent: true },
    orderBy: { sentAt: 'desc' },
  });

  if (latestAnnouncement) {
    await sendTelegramMessage(
      token,
      chatId,
      `🔔 *အသစ် Announcement ရှိပါသည်!*\n\nHR ဘက်က announcement အသစ် ထည့်ထားပါသည်။ ကြည့်ချင်ပါသလား?`,
      {
        inline_keyboard: [
          [{ text: '📋 Announcements ကြည့်မည်', callback_data: 'view_announcements' }],
          [{ text: '❌ နောက်မှ ကြည့်မည်', callback_data: 'ann_read:skip' }],
        ],
      }
    );
  }

  // Decide the welcome text based on whether they just finished or are returning
  let welcomeText = ``;
  if (member?.memberType === 'old') {
    welcomeText = `👋 ပြန်လည်ကြိုဆိုပါသည် ခင်ဗျာ!\n\nသိချင်တာကိစ္စများ သို့မဟုတ် အကူအညီလိုသည်များရှိပါက အချိန်မရွေး မေးမြန်းနိုင်ပါတယ် ✨`;
  } else if (isAllComplete) {
    welcomeText = `🎉 Onboarding အားလုံး ပြီးဆုံးသွားပါပြီ!\n\n👋 *${bot.name}* မှ ကြိုဆိုပါတယ်! ဘာများ ကူညီပေးရမလဲခင်ဗျာ? ✨`;
  } else {
    welcomeText = `✅ မှတ်ပုံတင်ခြင်း အောင်မြင်ပါတယ်။\n\n👋 *${bot.name}* မှ ကြိုဆိုပါတယ်! ဘာများ ကူညီပေးရမလဲခင်ဗျာ? ✨`;
  }

  await sendTelegramMessage(token, chatId, welcomeText);
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('botId');

    if (!botId) {
      return new NextResponse('Missing botId', { status: 400 });
    }

    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { documents: true, user: true },
    });

    if (!bot || !bot.telegramBotToken) {
      return new NextResponse('Bot not found or not configured for Telegram', { status: 404 });
    }

    const update = await request.json();
    const token = bot.telegramBotToken;

    // ── Deduplication: skip if this Telegram update_id was already processed ──
    // Use createMany + skipDuplicates to avoid DB-level unique constraint errors in logs
    const updateId = update?.update_id;
    if (typeof updateId === 'number') {
      const result = await prisma.processedUpdate.createMany({
        data: [{ updateId: BigInt(updateId), botId: bot.id }],
        skipDuplicates: true,
      });
      if (result.count === 0) {
        // Already processed — silently acknowledge
        return new NextResponse('OK', { status: 200 });
      }
    }

    // ─────────────────────────────────────────────
    // Route by Bot Category
    // telegram_sale → Sale flow handler
    // first_day_pro → Existing onboarding logic (continues below)
    // ─────────────────────────────────────────────
    if ((bot as any).botCategory === 'telegram_sale') {
      try {
        await handleTelegramSaleUpdate(bot, token, update);
      } catch (err) {
        console.error('Telegram Sale Error:', err);
      }
      return new NextResponse('OK', { status: 200 });
    }

    if ((bot as any).botCategory === 'telegram_agentic_sale') {
      try {
        await handleTelegramAgenticSaleUpdate(bot, token, update);
      } catch (err) {
        console.error('Agentic Sale Bot Error:', err);
      }
      return new NextResponse('OK', { status: 200 });
    }

    // ─────────────────────────────────────────────
    // Handle Callback Queries (Button Clicks)
    // ─────────────────────────────────────────────
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data as string;
      const username = callbackQuery.from?.username || callbackQuery.from?.first_name || null;

      // ── Handle step completion ──
      if (data.startsWith('complete:')) {
        const topicId = data.replace('complete:', '');
        const topics = (bot.onboardingTopics as unknown as OnboardingTopic[]) || [];
        const topicIndex = topics.findIndex(t => t.id === topicId);
        const topic = topicIndex >= 0 ? topics[topicIndex] : null;

        if (topic) {
          try {
            // Save completion
            await prisma.onboardingCompletion.upsert({
              where: {
                botId_telegramChatId_topicId: {
                  botId: bot.id,
                  telegramChatId: String(chatId),
                  topicId,
                },
              },
              create: {
                botId: bot.id,
                telegramChatId: String(chatId),
                telegramUsername: username,
                topicId,
                topicLabel: topic.label,
              },
              update: {
                telegramUsername: username,
                completedAt: new Date(),
              },
            });

            await answerCallbackQuery(
              token,
              callbackQuery.id,
              `✅ Step ${topicIndex + 1} complete!`
            );

            // Check what's next
            const progress = await getUserCurrentStep(bot.id, String(chatId), topics);

            if (progress.isAllComplete) {
              // 🎉 All steps done!
              await promoteToOldMember(bot.id, String(chatId));

              const summary = buildProgressSummary(topics, progress.completedIds);
              await sendTelegramMessage(
                token,
                chatId,
                `🎉 *Onboarding အားလုံး ပြီးဆုံးပါပြီ!*\n\n${summary}\n\n📊 *${progress.completedCount}/${topics.length}* completed\n\n🏆 Well done! အားလုံး complete ဖြစ်ပါပြီ!\n\n👑 သင်သည် အခုဆိုလျှင် Team Member တစ်ဦး ဖြစ်သွားပါပြီ။ HR ဘက်က announcement များကိုလည်း လက်ခံရရှိတော့မှာ ဖြစ်ပါတယ်။\n\n💬 သိချင်တာ ရှိရင် ရိုက်ထည့်ပြီး မေးလို့ရပါတယ်။`
              );
            } else {
              // Show next step
              const completedNow = topicIndex + 1;

              // Check if next step is locked by schedule
              if (progress.isStepLocked) {
                const timeStr = progress.availableAt
                  ? formatAvailableAt(progress.availableAt)
                  : 'နောက်မှ';
                await sendTelegramMessage(
                  token,
                  chatId,
                  `✅ *Step ${completedNow} ပြီးပါပြီ!*\n\n📊 Progress: ${progress.completedCount}/${topics.length}\n\n🔒 *နောက်တစ်ဆင့်အတွက် ${timeStr} မှာ နောက်ပိုင်း /start နှိပ်ပြီး ဆက်လုပ်နိုင်ပါတယ်ရှင်* ✨`
                );
              } else {
                await sendTelegramMessage(
                  token,
                  chatId,
                  `✅ *Step ${completedNow} ပြီးပါပြီ!*\n\n📊 Progress: ${progress.completedCount}/${topics.length}\n\nနောက်တစ်ဆင့်ကို ဆက်သွားပါမယ် ⬇️`
                );

                // Send next step card
                await sendStepCard(
                  token,
                  chatId,
                  progress.currentTopic!,
                  progress.currentIndex + 1,
                  topics.length
                );
              }
            }
          } catch (err) {
            console.error('Completion save error:', err);
            await answerCallbackQuery(token, callbackQuery.id, '⚠️ Error');
          }
        } else {
          await answerCallbackQuery(token, callbackQuery.id);
        }

        return new NextResponse('OK', { status: 200 });
      }

      // ── Handle "Start step" button (read content) ──
      if (data.startsWith('onboarding:')) {
        const topicId = data.replace('onboarding:', '');
        const topics = (bot.onboardingTopics as unknown as OnboardingTopic[]) || [];
        const topicIndex = topics.findIndex(t => t.id === topicId);
        const topic = topicIndex >= 0 ? topics[topicIndex] : null;

        if (topic) {
          await answerCallbackQuery(token, callbackQuery.id, `${topic.icon} ${topic.label}`);

          try {
            if (topic.useAI && topic.prompt) {
              // ── AI Mode: Generate response via AI ──
              await sendTypingIndicator(token, chatId);

              const topicPrompt = `User clicked on the "${topic.label}" topic button. ${topic.prompt}\n\nPlease provide a helpful, friendly, and detailed response about this topic.`;
              const aiResponse = await generateBotResponse(bot.id, topicPrompt, [], 'telegram');

              await sendTelegramMessage(
                token,
                chatId,
                `${topic.icon} *Step ${topicIndex + 1}: ${topic.label}*\n\n${aiResponse}`,
                buildCompleteStepKeyboard(topic.id, topic.buttonText)
              );
            } else {
              // ── Direct Mode: Send content as-is (default) ──
              const messageContent = topic.content || topic.prompt || '';

              // Send photos as album (grouped)
              if (topic.images && topic.images.length > 0) {
                await sendTelegramPhotos(token, chatId, topic.images);
              }

              if (topic.requireUpload) {
                // Upload verification step — show custom or default instructions
                const instruction =
                  topic.uploadInstruction ||
                  '📝 Summary ရေးပြီး text ပို့ပေးပါ ဒါမှမဟုတ် screenshot ရိုက်ပို့ပေးပါ။';
                await sendTelegramMessage(
                  token,
                  chatId,
                  messageContent + `\n\n*${instruction}*\nAI က စစ်ဆေးပေးပါမယ်။`
                );
              } else {
                // Normal step — show done button
                await sendTelegramMessage(
                  token,
                  chatId,
                  messageContent,
                  buildCompleteStepKeyboard(topic.id, topic.buttonText)
                );
              }
            }
          } catch (err) {
            console.error('Onboarding topic response error:', err);
            await sendTelegramMessage(
              token,
              chatId,
              '⚠️ တစ်ခုခု မှားသွားပါတယ်။ ထပ်ကြိုးစားကြည့်ပါ။'
            );
          }
        } else {
          await answerCallbackQuery(token, callbackQuery.id);
        }

        return new NextResponse('OK', { status: 200 });
      }

      // ── Handle Member Registration ──
      if (data.startsWith('register:')) {
        const type = data.split(':')[1];

        await answerCallbackQuery(token, callbackQuery.id, `✅ မှတ်ပုံတင်ပြီးပါပြီ!`);

        // Register the user
        const member = await registerMember(bot.id, String(chatId), callbackQuery.from || {}, type);

        // Hide the inline keyboard from the welcome message
        try {
          if (callbackQuery.message && callbackQuery.message.message_id) {
            await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                reply_markup: { inline_keyboard: [] },
              }),
            });
          }
        } catch (e) {
          console.error('Failed to edit inline keyboard:', e);
        }

        // Ask for name/email from ALL members (both new and old)
        await prisma.telegramMember.update({
          where: { botId_telegramChatId: { botId: bot.id, telegramChatId: String(chatId) } },
          data: { registrationStep: 'awaiting_name' },
        });
        await sendTelegramMessage(
          token,
          chatId,
          `📝 *သင့်နာမည် (Name) ကို ရိုက်ထည့်ပေးပါ*\n\nExample: မောင်မောင်`
        );
        return new NextResponse('OK', { status: 200 });
      }

      // ── Handle announcement read acknowledgement ──
      if (data.startsWith('ann_read:')) {
        await answerCallbackQuery(token, callbackQuery.id, '✅ ဖတ်ပြီးပါပြီ! ကျေးဇူးတင်ပါတယ်');
        return new NextResponse('OK', { status: 200 });
      }

      // ── Handle view announcements button ──
      if (data === 'view_announcements') {
        await answerCallbackQuery(token, callbackQuery.id, 'Announcements ကြည့်နေပါတယ်...');
        const latestAnnouncements = await prisma.announcement.findMany({
          where: { botId: bot.id, isSent: true },
          orderBy: { sentAt: 'desc' },
          take: 3,
        });

        if (latestAnnouncements.length === 0) {
          await sendTelegramMessage(token, chatId, '📭 Announcements မရှိသေးပါ။');
        } else {
          for (const ann of latestAnnouncements) {
            const dateStr = ann.sentAt
              ? new Date(ann.sentAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : '';
            await sendTelegramMessage(
              token,
              chatId,
              `📢 *${ann.title}*\n\n${ann.content}\n\n_${dateStr}_`
            );
          }
        }
        return new NextResponse('OK', { status: 200 });
      }

      // Unknown callback — just acknowledge
      await answerCallbackQuery(token, callbackQuery.id);
    }

    // ─────────────────────────────────────────────
    // Handle Text Messages
    // ─────────────────────────────────────────────
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const userMessage = update.message.text;

      // Handle /start command
      if (userMessage === '/start') {
        let member = await prisma.telegramMember.findUnique({
          where: { botId_telegramChatId: { botId: bot.id, telegramChatId: String(chatId) } },
        });

        if (!member) {
          // Send Member Type Selection
          await sendTelegramMessage(
            token,
            chatId,
            `🎉 *MOT Project မှ ကြိုဆိုပါတယ်!*\n\nကျွန်တော်က *${bot.name}* ပါ။ သင့်ကို ကူညီပေးဖို့ အဆင်သင့်ရှိပါတယ်။ 🚀\n\nပထမဆုံးအနေနဲ့ သင်ဘယ် Member အမျိုးအစားလဲဆိုတာကို အောက်မှာ ရွေးချယ်ပေးပါခင်ဗျာ 👇`,
            {
              inline_keyboard: [
                [{ text: '🆕 New Member (ဝန်ထမ်းသစ်)', callback_data: 'register:new' }],
                [{ text: '⭐ Old Member (ဝန်ထမ်းဟောင်း)', callback_data: 'register:old' }],
              ],
            }
          );
          return new NextResponse('OK', { status: 200 });
        }

        // If member is in registration flow, reset and re-ask
        if (member.registrationStep) {
          await prisma.telegramMember.update({
            where: { botId_telegramChatId: { botId: bot.id, telegramChatId: String(chatId) } },
            data: { registrationStep: 'awaiting_name' },
          });
          await sendTelegramMessage(
            token,
            chatId,
            `📝 *သင့်နာမည် (Name) ကို ရိုက်ထည့်ပေးပါ*\n\nExample: မောင်မောင်`
          );
          return new NextResponse('OK', { status: 200 });
        }

        // Existing member — only update telegramUsername (don't overwrite typed name)
        if (member.email) {
          // Already completed name/email registration — just update username
          await prisma.telegramMember.update({
            where: { botId_telegramChatId: { botId: bot.id, telegramChatId: String(chatId) } },
            data: { telegramUsername: update.message.from?.username || null },
          });
        } else {
          member = await registerMember(bot.id, String(chatId), update.message.from || {});
        }

        await handlePostStartFlow(bot, token, chatId, member);
        return new NextResponse('OK', { status: 200 });
      }

      // ─────────────────────────────────────────────
      // Handle Name/Email Registration Flow
      // ─────────────────────────────────────────────
      {
        const existingMember = await prisma.telegramMember.findUnique({
          where: { botId_telegramChatId: { botId: bot.id, telegramChatId: String(chatId) } },
        });

        if (existingMember?.registrationStep === 'awaiting_name') {
          const name = userMessage.trim();
          if (name.length < 2 || name.startsWith('/')) {
            await sendTelegramMessage(
              token,
              chatId,
              `❌ နာမည် မမှန်ပါ။ ကျေးဇူးပြု၍ ထပ်ရိုက်ပေးပါ\n\nExample: မောင်မောင်`
            );
            return new NextResponse('OK', { status: 200 });
          }

          await prisma.telegramMember.update({
            where: { botId_telegramChatId: { botId: bot.id, telegramChatId: String(chatId) } },
            data: { firstName: name, lastName: null, registrationStep: 'awaiting_email' },
          });

          await sendTelegramMessage(
            token,
            chatId,
            `✅ နာမည်: *${name}*\n\n📧 *သင့် Email ကို ရိုက်ထည့်ပေးပါ*\n\nExample: maungmaung@company.com`
          );
          return new NextResponse('OK', { status: 200 });
        }

        if (existingMember?.registrationStep === 'awaiting_email') {
          const email = userMessage.trim();
          // Basic email validation
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            await sendTelegramMessage(
              token,
              chatId,
              `❌ Email format မမှန်ပါ။ ကျေးဇူးပြု၍ ထပ်ရိုက်ပေးပါ\n\nExample: maungmaung@company.com`
            );
            return new NextResponse('OK', { status: 200 });
          }

          const updatedMember = await prisma.telegramMember.update({
            where: { botId_telegramChatId: { botId: bot.id, telegramChatId: String(chatId) } },
            data: { email, registrationStep: null }, // Clear registration step = done
          });

          await sendTelegramMessage(
            token,
            chatId,
            `✅ *မှတ်ပုံတင်ခြင်း ပြီးဆုံးပါပြီ!*\n\n👤 Name: *${updatedMember.firstName}*\n📧 Email: *${email}*\n\nOnboarding process ကို စလုပ်ပါမယ် 🚀`
          );

          // Proceed to onboarding
          await handlePostStartFlow(bot, token, chatId, updatedMember);
          return new NextResponse('OK', { status: 200 });
        }
      }

      // Handle /progress command (show progress overview)
      if (userMessage === '/progress' || userMessage === '/menu') {
        if (bot.onboardingEnabled && bot.onboardingTopics) {
          const topics = bot.onboardingTopics as unknown as OnboardingTopic[];
          if (topics.length > 0) {
            const progress = await getUserCurrentStep(bot.id, String(chatId), topics);
            const summary = buildProgressSummary(topics, progress.completedIds, progress.stepAvailabilityMap);
            let message = `📊 *Onboarding Progress*\n\n${summary}\n\n`;

            if (progress.isAllComplete) {
              message += `🎉 *${progress.completedCount}/${topics.length}* - အားလုံး complete ပြီးပါပြီ!`;
            } else if (progress.isStepLocked) {
              const timeStr = progress.availableAt
                ? formatAvailableAt(progress.availableAt)
                : 'နောက်မှ';
              message += `📌 *${progress.completedCount}/${topics.length}* completed\n\n🔒 နောက်တစ်ဆင့်အတွက် ${timeStr} မှာ နောက်ပိုင်း /start နှိပ်ပြီး ဆက်လုပ်နိုင်ပါတယ်ရှင် ✨`;
            } else {
              message += `📌 *${progress.completedCount}/${topics.length}* completed\n\n💡 /start ကို ရိုက်ပြီး ဆက်လုပ်နိုင်ပါတယ်`;
            }

            await sendTelegramMessage(token, chatId, message);
            return new NextResponse('OK', { status: 200 });
          }
        }
        await sendTelegramMessage(
          token,
          chatId,
          '💬 Onboarding process မရှိပါ။ သိချင်တာ ရိုက်ပြီး မေးလို့ရပါတယ်!'
        );
        return new NextResponse('OK', { status: 200 });
      }
      // ─────────────────────────────────────────────
      // Text Verification (for requireUpload steps)
      // ─────────────────────────────────────────────
      if (
        bot.onboardingEnabled &&
        bot.onboardingTopics &&
        userMessage &&
        userMessage !== '/start' &&
        userMessage !== '/progress' &&
        userMessage !== '/menu'
      ) {
        // First check if the user is an old member, if so, they completely bypass onboarding checks
        const currentMember = await prisma.telegramMember.findUnique({
          where: { botId_telegramChatId: { botId: bot.id, telegramChatId: String(chatId) } },
        });

        if (currentMember?.memberType !== 'old') {
          const topics = bot.onboardingTopics as unknown as OnboardingTopic[];
          const progress = await getUserCurrentStep(bot.id, String(chatId), topics);

          if (!progress.isAllComplete && progress.currentTopic?.requireUpload) {
            const topic = progress.currentTopic;
            const username =
              update.message?.from?.username || update.message?.from?.first_name || null;

            try {
              await sendTelegramMessage(token, chatId, '🔍 *စစ်ဆေးနေပါတယ်...* ခဏစောင့်ပါ');
              await sendTypingIndicator(token, chatId);

              const verificationPrompt =
                topic.verificationPrompt || `Check if this text is related to: ${topic.label}`;
              const result = await verifyTextSubmission(
                userMessage,
                verificationPrompt,
                topic.label,
                bot.id
              );

              if (result.passed) {
                // ✅ PASSED — auto-complete step
                await prisma.onboardingCompletion.upsert({
                  where: {
                    botId_telegramChatId_topicId: {
                      botId: bot.id,
                      telegramChatId: String(chatId),
                      topicId: topic.id,
                    },
                  },
                  create: {
                    botId: bot.id,
                    telegramChatId: String(chatId),
                    telegramUsername: username,
                    topicId: topic.id,
                    topicLabel: topic.label,
                  },
                  update: {
                    telegramUsername: username,
                    completedAt: new Date(),
                  },
                });

                const updatedProgress = await getUserCurrentStep(bot.id, String(chatId), topics);

                if (updatedProgress.isAllComplete) {
                  await promoteToOldMember(bot.id, String(chatId));
                  const summary = buildProgressSummary(topics, updatedProgress.completedIds, updatedProgress.stepAvailabilityMap);
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n🎉 *Onboarding အားလုံး ပြီးဆုံးပါပြီ!*\n\n${summary}\n\n📊 *${updatedProgress.completedCount}/${topics.length}* completed\n\n🏆 Well done!\n\n👑 သင်သည် အခုဆိုလျှင် Team Member တစ်ဦး ဖြစ်သွားပါပြီ။ HR ဘက်က announcement များကိုလည်း လက်ခံရရှိတော့မှာ ဖြစ်ပါတယ်။\n\n💬 သိချင်တာ ရှိရင် ရိုက်ထည့်ပြီး မေးလို့ရပါတယ်။`
                  );
                } else if (updatedProgress.isStepLocked) {
                  const timeStr = updatedProgress.availableAt
                    ? formatAvailableAt(updatedProgress.availableAt)
                    : 'နောက်မှ';
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n📊 Progress: ${updatedProgress.completedCount}/${topics.length}\n\n🔒 *နောက်တစ်ဆင့်အတွက် ${timeStr} မှာ နောက်ပိုင်း /start နှိပ်ပြီး ဆက်လုပ်နိုင်ပါတယ်ရှင်* ✨`
                  );
                } else {
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n📊 Progress: ${updatedProgress.completedCount}/${topics.length}\n\nနောက်တစ်ဆင့်ကို ဆက်သွားပါမယ် ⬇️`
                  );

                  await sendStepCard(
                    token,
                    chatId,
                    updatedProgress.currentTopic!,
                    updatedProgress.currentIndex + 1,
                    topics.length
                  );
                }
              } else {
                // ❌ FAILED — ask to redo
                await sendTelegramMessage(
                  token,
                  chatId,
                  `❌ *${result.feedback}*\n\n📝 ပြန်စစ်ပြီး summary အသစ် ရေးပို့ပေးပါ ဒါမှမဟုတ် screenshot ပို့ပေးပါ။`
                );
              }
            } catch (err) {
              console.error('Text verification error:', err);
              await sendTelegramMessage(
                token,
                chatId,
                '⚠️ စစ်ဆေးရာမှာ အမှားဖြစ်သွားပါတယ်။ ပြန်ပို့ပေးပါ။'
              );
            }

            return new NextResponse('OK', { status: 200 });
          }
        }
      }

      // Normal AI chat for all other messages
      try {
        await sendTypingIndicator(token, chatId);
        const aiResponse = await generateBotResponse(bot.id, userMessage, [], 'telegram');
        await sendTelegramMessage(token, chatId, aiResponse);
      } catch (err) {
        console.error('Telegram Bot processing error:', err);
        await sendTelegramMessage(
          token,
          chatId,
          '⚠️ တစ်ခုခု မှားသွားပါတယ်။ ခဏနေ ထပ်ကြိုးစားကြည့်ပါ။'
        );
      }
    }

    // ─────────────────────────────────────────────
    // Handle Photo Uploads (Verification Flow)
    // ─────────────────────────────────────────────
    if (update.message && update.message.photo) {
      const chatId = update.message.chat.id;
      const username = update.message.from?.username || update.message.from?.first_name || null;

      if (bot.onboardingEnabled && bot.onboardingTopics) {
        const topics = bot.onboardingTopics as unknown as OnboardingTopic[];
        const progress = await getUserCurrentStep(bot.id, String(chatId), topics);

        // Check if current step requires upload
        if (!progress.isAllComplete && progress.currentTopic?.requireUpload) {
          const topic = progress.currentTopic;
          const topicIndex = progress.currentIndex;

          try {
            await sendTelegramMessage(token, chatId, '🔍 *စစ်ဆေးနေပါတယ်...* ခဏစောင့်ပါ');
            await sendTypingIndicator(token, chatId);

            // Get the largest photo (last in array)
            const photos = update.message.photo;
            const largestPhoto = photos[photos.length - 1];
            const fileUrl = await getTelegramFileUrl(token, largestPhoto.file_id);

            if (!fileUrl) {
              await sendTelegramMessage(
                token,
                chatId,
                '⚠️ ဓာတ်ပုံ download လုပ်လို့ မရပါ။ ပြန်ပို့ပေးပါ။'
              );
              return new NextResponse('OK', { status: 200 });
            }

            // Check current progress for this step
            const existing = await prisma.onboardingCompletion.findUnique({
              where: {
                botId_telegramChatId_topicId: {
                  botId: bot.id,
                  telegramChatId: String(chatId),
                  topicId: topic.id,
                },
              },
            });

            const currentVerifiedCount = existing?.verifiedCount || 0;
            const requiredCount = topic.requiredUploads || 1;

            // Verify with AI
            let verificationPrompt =
              topic.verificationPrompt ||
              `Check if this image shows proof of completing: ${topic.label}`;

            // Add context if it's a multi-upload step
            if (requiredCount > 1) {
              verificationPrompt += `\n\n[CONTEXT: User has already submitted ${currentVerifiedCount} of ${requiredCount} required proofs. This is their next submission. For steps like 2FA, they should send different screens (e.g. one laptop, one phone). Ensure this submission is valid and provides a new piece of proof.]`;
            }

            const result = await verifyUploadedImage(
              fileUrl,
              verificationPrompt,
              topic.label,
              bot.id
            );

            if (result.passed) {
              const currentCount = currentVerifiedCount + 1;
              const required = requiredCount;

              if (currentCount >= required) {
                // ✅ ALL uploads verified — complete the step
                await prisma.onboardingCompletion.upsert({
                  where: {
                    botId_telegramChatId_topicId: {
                      botId: bot.id,
                      telegramChatId: String(chatId),
                      topicId: topic.id,
                    },
                  },
                  create: {
                    botId: bot.id,
                    telegramChatId: String(chatId),
                    telegramUsername: username,
                    topicId: topic.id,
                    topicLabel: topic.label,
                    verifiedCount: currentCount,
                  },
                  update: {
                    telegramUsername: username,
                    verifiedCount: currentCount,
                    completedAt: new Date(),
                  },
                });

                const updatedProgress = await getUserCurrentStep(bot.id, String(chatId), topics);

                if (updatedProgress.isAllComplete) {
                  await promoteToOldMember(bot.id, String(chatId));
                  const summary = buildProgressSummary(topics, updatedProgress.completedIds, updatedProgress.stepAvailabilityMap);
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n🎉 *Onboarding အားလုံး ပြီးဆုံးပါပြီ!*\n\n${summary}\n\n📊 *${updatedProgress.completedCount}/${topics.length}* completed\n\n🏆 Well done!\n\n👑 သင်သည် အခုဆိုလျှင် Team Member တစ်ဦး ဖြစ်သွားပါပြီ။ HR ဘက်က announcement များကိုလည်း လက်ခံရရှိတော့မှာ ဖြစ်ပါတယ်။\n\n💬 သိချင်တာ ရှိရင် ရိုက်ထည့်ပြီး မေးလို့ရပါတယ်။`
                  );
                } else if (updatedProgress.isStepLocked) {
                  const timeStr = updatedProgress.availableAt
                    ? formatAvailableAt(updatedProgress.availableAt)
                    : 'နောက်မှ';
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n📊 Progress: ${updatedProgress.completedCount}/${topics.length}\n\n🔒 *နောက်တစ်ဆင့်အတွက် ${timeStr} မှာ နောက်ပိုင်း /start နှိပ်ပြီး ဆက်လုပ်နိုင်ပါတယ်ရှင်* ✨`
                  );
                } else {
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n📊 Progress: ${updatedProgress.completedCount}/${topics.length}\n\nနောက်တစ်ဆင့်ကို ဆက်သွားပါမယ် ⬇️`
                  );

                  await sendStepCard(
                    token,
                    chatId,
                    updatedProgress.currentTopic!,
                    updatedProgress.currentIndex + 1,
                    topics.length
                  );
                }
              } else {
                // ⏳ Partially verified — save count and ask for more
                await prisma.onboardingCompletion.upsert({
                  where: {
                    botId_telegramChatId_topicId: {
                      botId: bot.id,
                      telegramChatId: String(chatId),
                      topicId: topic.id,
                    },
                  },
                  create: {
                    botId: bot.id,
                    telegramChatId: String(chatId),
                    telegramUsername: username,
                    topicId: topic.id,
                    topicLabel: topic.label,
                    verifiedCount: currentCount,
                    // Use a past date to indicate it's not fully complete yet
                    completedAt: new Date(0),
                  },
                  update: {
                    verifiedCount: currentCount,
                  },
                });

                await sendTelegramMessage(
                  token,
                  chatId,
                  `✅ *${result.feedback}*\n\n📸 *${currentCount}/${required}* verified!\n\nနောက်ထပ် screenshot/ဓာတ်ပုံ ထပ်ပို့ပေးပါ။`
                );
              }
            } else {
              // ❌ FAILED — ask to redo
              await sendTelegramMessage(
                token,
                chatId,
                `❌ *${result.feedback}*\n\n📸 ပြန်စစ်ပြီး screenshot/ဓာတ်ပုံ အသစ် ပို့ပေးပါ။`
              );
            }
          } catch (err) {
            console.error('Photo verification error:', err);
            await sendTelegramMessage(
              token,
              chatId,
              '⚠️ စစ်ဆေးရာမှာ အမှားဖြစ်သွားပါတယ်။ ပြန်ပို့ပေးပါ။'
            );
          }

          return new NextResponse('OK', { status: 200 });
        }
      }

      // If no verification needed, just acknowledge the photo
      await sendTelegramMessage(
        token,
        chatId,
        '📸 ဓာတ်ပုံ လက်ခံရရှိပါတယ်။ သိချင်တာ ရှိရင် ရိုက်ပြီး မေးလို့ရပါတယ်!'
      );
      return new NextResponse('OK', { status: 200 });
    }

    // ─────────────────────────────────────────────
    // Handle Document/File Uploads (Verification Flow)
    // ─────────────────────────────────────────────
    if (update.message && update.message.document) {
      const chatId = update.message.chat.id;
      const username = update.message.from?.username || update.message.from?.first_name || null;

      if (bot.onboardingEnabled && bot.onboardingTopics) {
        const topics = bot.onboardingTopics as unknown as OnboardingTopic[];
        const progress = await getUserCurrentStep(bot.id, String(chatId), topics);

        if (!progress.isAllComplete && progress.currentTopic?.requireUpload) {
          const topic = progress.currentTopic;
          const doc = update.message.document;
          const mimeType: string = doc.mime_type || '';
          const fileName: string = doc.file_name || '';

          try {
            await sendTelegramMessage(token, chatId, '🔍 *စစ်ဆေးနေပါတယ်...* ခဏစောင့်ပါ');
            await sendTypingIndicator(token, chatId);

            const fileUrl = await getTelegramFileUrl(token, doc.file_id);
            if (!fileUrl) {
              await sendTelegramMessage(
                token,
                chatId,
                '⚠️ File download လုပ်လို့ မရပါ။ ပြန်ပို့ပေးပါ။'
              );
              return new NextResponse('OK', { status: 200 });
            }

            // Track progress
            const existing = await prisma.onboardingCompletion.findUnique({
              where: {
                botId_telegramChatId_topicId: {
                  botId: bot.id,
                  telegramChatId: String(chatId),
                  topicId: topic.id,
                },
              },
            });

            const currentVerifiedCount = existing?.verifiedCount || 0;
            const requiredCount = topic.requiredUploads || 1;

            let verificationPrompt =
              topic.verificationPrompt || `Check if this is related to: ${topic.label}`;

            if (requiredCount > 1) {
              verificationPrompt += `\n\n[CONTEXT: User has already submitted ${currentVerifiedCount} of ${requiredCount} required proofs. This is their next submission. For steps like 2FA, they should send different screens (e.g. one laptop, one phone). Ensure this submission is valid and provides a new piece of proof.]`;
            }
            let result: { passed: boolean; reason: string; feedback: string };

            if (mimeType.startsWith('image/')) {
              // Image file → Vision AI
              result = await verifyUploadedImage(fileUrl, verificationPrompt, topic.label, bot.id);
            } else if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
              // Text file → read content and verify
              const textResponse = await fetch(fileUrl);
              const textContent = await textResponse.text();
              result = await verifyTextSubmission(
                textContent,
                verificationPrompt,
                topic.label,
                bot.id
              );
            } else if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
              // PDF → extract text with unpdf
              const { extractText } = await import('unpdf');
              const pdfResponse = await fetch(fileUrl);
              const pdfBuffer = await pdfResponse.arrayBuffer();
              const { text: pdfTextArr } = await extractText(new Uint8Array(pdfBuffer));
              const pdfText = Array.isArray(pdfTextArr)
                ? pdfTextArr.join('\n')
                : String(pdfTextArr);
              if (!pdfText || pdfText.trim().length < 10) {
                await sendTelegramMessage(
                  token,
                  chatId,
                  '⚠️ PDF ထဲက text ဖတ်လို့ မရပါ။ Text ရိုက်ပို့ပေးပါ ဒါမှမဟုတ် screenshot ပို့ပေးပါ။'
                );
                return new NextResponse('OK', { status: 200 });
              }
              result = await verifyTextSubmission(pdfText, verificationPrompt, topic.label, bot.id);
            } else if (
              mimeType ===
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
              mimeType === 'application/msword' ||
              fileName.endsWith('.docx') ||
              fileName.endsWith('.doc')
            ) {
              // Word → extract text with mammoth
              const mammoth = await import('mammoth');
              const docResponse = await fetch(fileUrl);
              const docBuffer = Buffer.from(await docResponse.arrayBuffer());
              const { value: docText } = await mammoth.extractRawText({ buffer: docBuffer });
              if (!docText || docText.trim().length < 10) {
                await sendTelegramMessage(
                  token,
                  chatId,
                  '⚠️ Word file ထဲက text ဖတ်လို့ မရပါ။ Text ရိုက်ပို့ပေးပါ ဒါမှမဟုတ် screenshot ပို့ပေးပါ။'
                );
                return new NextResponse('OK', { status: 200 });
              }
              result = await verifyTextSubmission(docText, verificationPrompt, topic.label, bot.id);
            } else {
              // Unsupported file type
              await sendTelegramMessage(
                token,
                chatId,
                `⚠️ ဒီ file type (${mimeType || fileName}) ကို စစ်ဆေးလို့ မရပါ။\n\n📝 Text ရိုက်ပြီး ပို့ပေးပါ ဒါမှမဟုတ် screenshot/photo ပို့ပေးပါ။`
              );
              return new NextResponse('OK', { status: 200 });
            }

            if (result.passed) {
              const currentCount = currentVerifiedCount + 1;
              const required = requiredCount;

              if (currentCount >= required) {
                // ✅ ALL complete
                await prisma.onboardingCompletion.upsert({
                  where: {
                    botId_telegramChatId_topicId: {
                      botId: bot.id,
                      telegramChatId: String(chatId),
                      topicId: topic.id,
                    },
                  },
                  create: {
                    botId: bot.id,
                    telegramChatId: String(chatId),
                    telegramUsername: username,
                    topicId: topic.id,
                    topicLabel: topic.label,
                    verifiedCount: currentCount,
                  },
                  update: {
                    telegramUsername: username,
                    verifiedCount: currentCount,
                    completedAt: new Date(),
                  },
                });

                const updatedProgress = await getUserCurrentStep(bot.id, String(chatId), topics);

                if (updatedProgress.isAllComplete) {
                  const summary = buildProgressSummary(topics, updatedProgress.completedIds, updatedProgress.stepAvailabilityMap);
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n🎉 *Onboarding အားလုံး ပြီးဆုံးပါပြီ!*\n\n${summary}\n\n📊 *${updatedProgress.completedCount}/${topics.length}* completed\n\n🏆 Well done!\n\n💬 သိချင်တာ ရှိရင် ရိုက်ထည့်ပြီး မေးလို့ရပါတယ်။`
                  );
                } else if (updatedProgress.isStepLocked) {
                  const timeStr = updatedProgress.availableAt
                    ? formatAvailableAt(updatedProgress.availableAt)
                    : 'နောက်မှ';
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n📊 Progress: ${updatedProgress.completedCount}/${topics.length}\n\n🔒 *နောက်တစ်ဆင့်အတွက် ${timeStr} မှာ နောက်ပိုင်း /start နှိပ်ပြီး ဆက်လုပ်နိုင်ပါတယ်ရှင်* ✨`
                  );
                } else {
                  await sendTelegramMessage(
                    token,
                    chatId,
                    `✅ *${result.feedback}*\n\n📊 Progress: ${updatedProgress.completedCount}/${topics.length}\n\nနောက်တစ်ဆင့်ကို ဆက်သွားပါမယ် ⬇️`
                  );

                  await sendStepCard(
                    token,
                    chatId,
                    updatedProgress.currentTopic!,
                    updatedProgress.currentIndex + 1,
                    topics.length
                  );
                }
              } else {
                // ⏳ Partial
                await prisma.onboardingCompletion.upsert({
                  where: {
                    botId_telegramChatId_topicId: {
                      botId: bot.id,
                      telegramChatId: String(chatId),
                      topicId: topic.id,
                    },
                  },
                  create: {
                    botId: bot.id,
                    telegramChatId: String(chatId),
                    telegramUsername: username,
                    topicId: topic.id,
                    topicLabel: topic.label,
                    verifiedCount: currentCount,
                    completedAt: new Date(0),
                  },
                  update: {
                    verifiedCount: currentCount,
                  },
                });

                await sendTelegramMessage(
                  token,
                  chatId,
                  `✅ *${result.feedback}*\n\n� *${currentCount}/${required}* verified!\n\nနောက်ထပ် file/ဓာတ်ပုံ ထပ်ပို့ပေးပါ။`
                );
              }
            } else {
              // ❌ Failed
              await sendTelegramMessage(
                token,
                chatId,
                `❌ *${result.feedback}*\n\n📝 ပြန်စစ်ပြီး submission အသစ် ပို့ပေးပါ။`
              );
            }
          } catch (err) {
            console.error('Document verification error:', err);
            await sendTelegramMessage(
              token,
              chatId,
              '⚠️ စစ်ဆေးရာမှာ အမှားဖြစ်သွားပါတယ်။ ပြန်ပို့ပေးပါ။'
            );
          }

          return new NextResponse('OK', { status: 200 });
        }
      }

      // If no verification needed, just acknowledge the file
      await sendTelegramMessage(
        token,
        chatId,
        '📄 File လက်ခံရရှိပါတယ်။ သိချင်တာ ရှိရင် ရိုက်ပြီး မေးလို့ရပါတယ်!'
      );
      return new NextResponse('OK', { status: 200 });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('Telegram Webhook Error:', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
