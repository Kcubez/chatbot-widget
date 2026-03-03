import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateBotResponse } from '@/lib/ai';
import {
  sendTelegramMessage,
  sendTelegramPhotos,
  sendTypingIndicator,
  answerCallbackQuery,
  buildStartStepKeyboard,
  buildCompleteStepKeyboard,
  buildProgressSummary,
  OnboardingTopic,
} from '@/lib/telegram';

// ─────────────────────────────────────────────
// Helper: Get user's current step
// ─────────────────────────────────────────────
async function getUserCurrentStep(botId: string, chatId: string, topics: OnboardingTopic[]) {
  // Get all completed topic IDs for this user
  const completions = await prisma.onboardingCompletion.findMany({
    where: {
      botId,
      telegramChatId: chatId,
    },
    select: { topicId: true },
  });

  const completedIds = new Set(completions.map(c => c.topicId));

  // Find the first topic that hasn't been completed (by order)
  const currentIndex = topics.findIndex(t => !completedIds.has(t.id));

  return {
    completedIds,
    completedCount: completedIds.size,
    currentIndex, // -1 if all completed
    currentTopic: currentIndex >= 0 ? topics[currentIndex] : null,
    isAllComplete: currentIndex === -1,
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

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('botId');

    if (!botId) {
      return new NextResponse('Missing botId', { status: 400 });
    }

    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { documents: true },
    });

    if (!bot || !bot.telegramBotToken) {
      return new NextResponse('Bot not found or not configured for Telegram', { status: 404 });
    }

    const update = await request.json();
    const token = bot.telegramBotToken;

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
              const summary = buildProgressSummary(topics, progress.completedIds);
              await sendTelegramMessage(
                token,
                chatId,
                `🎉 *Onboarding အားလုံး ပြီးဆုံးပါပြီ!*\n\n${summary}\n\n📊 *${progress.completedCount}/${topics.length}* completed\n\n🏆 Well done! အားလုံး complete ဖြစ်ပါပြီ!\n\n💬 သိချင်တာ ရှိရင် ရိုက်ထည့်ပြီး မေးလို့ရပါတယ်။`
              );
            } else {
              // Show next step
              const completedNow = topicIndex + 1;
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

              await sendTelegramMessage(
                token,
                chatId,
                messageContent,
                buildCompleteStepKeyboard(topic.id, topic.buttonText)
              );
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
        if (bot.onboardingEnabled && bot.onboardingTopics) {
          const topics = bot.onboardingTopics as unknown as OnboardingTopic[];

          if (topics.length > 0) {
            // Check user's progress
            const progress = await getUserCurrentStep(bot.id, String(chatId), topics);

            if (progress.isAllComplete) {
              // Already completed everything
              const summary = buildProgressSummary(topics, progress.completedIds);
              await sendTelegramMessage(
                token,
                chatId,
                `🎉 *Onboarding အားလုံး ပြီးဆုံးပြီးပါပြီ!*\n\n${summary}\n\n📊 *${progress.completedCount}/${topics.length}* completed ✅\n\n💬 သိချင်တာ ရှိရင် ရိုက်ထည့်ပြီး မေးလို့ရပါတယ်။`
              );
            } else {
              // Send welcome message
              const welcomeMessage =
                bot.onboardingWelcome ||
                `🎉 *${bot.name}* မှ ကြိုဆိုပါတယ်!\n\nOnboarding process ကို တစ်ဆင့်ချင်း လုပ်သွားပါမယ်။`;

              // Show progress if returning user
              if (progress.completedCount > 0) {
                const summary = buildProgressSummary(topics, progress.completedIds);
                await sendTelegramMessage(
                  token,
                  chatId,
                  `${welcomeMessage}\n\n📊 *Progress: ${progress.completedCount}/${topics.length}*\n\n${summary}\n\nနောက်တစ်ဆင့်ကို ဆက်လုပ်ပါ ⬇️`
                );
              } else {
                await sendTelegramMessage(token, chatId, welcomeMessage);
              }

              // Show current step card
              await sendStepCard(
                token,
                chatId,
                progress.currentTopic!,
                progress.currentIndex + 1,
                topics.length
              );
            }

            return new NextResponse('OK', { status: 200 });
          }
        }

        // If onboarding is off, send a simple welcome
        await sendTelegramMessage(
          token,
          chatId,
          `👋 *${bot.name}* မှ ကြိုဆိုပါတယ်!\n\nသိချင်တာ ရှိရင် မေးလို့ရပါပြီ ✨`
        );
        return new NextResponse('OK', { status: 200 });
      }

      // Handle /progress command (show progress overview)
      if (userMessage === '/progress' || userMessage === '/menu') {
        if (bot.onboardingEnabled && bot.onboardingTopics) {
          const topics = bot.onboardingTopics as unknown as OnboardingTopic[];
          if (topics.length > 0) {
            const progress = await getUserCurrentStep(bot.id, String(chatId), topics);
            const summary = buildProgressSummary(topics, progress.completedIds);

            let message = `📊 *Onboarding Progress*\n\n${summary}\n\n`;

            if (progress.isAllComplete) {
              message += `🎉 *${progress.completedCount}/${topics.length}* - အားလုံး complete ပြီးပါပြီ!`;
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

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('Telegram Webhook Error:', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
