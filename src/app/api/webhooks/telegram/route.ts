import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateBotResponse } from '@/lib/ai';
import {
  sendTelegramMessage,
  answerCallbackQuery,
  buildTopicsKeyboard,
  buildBackToMenuKeyboard,
  OnboardingTopic,
} from '@/lib/telegram';

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

      if (data === 'onboarding:back_to_menu') {
        // Acknowledge with toast notification
        await answerCallbackQuery(token, callbackQuery.id, '⬅️ Menu');

        // Show the onboarding menu again
        const topics = (bot.onboardingTopics as unknown as OnboardingTopic[]) || [];
        const welcomeMessage =
          bot.onboardingWelcome ||
          `🎉 *${bot.name}* မှ ကြိုဆိုပါတယ်!\n\nဘယ်အကြောင်း သိချင်ပါသလဲ? 👇`;

        await sendTelegramMessage(token, chatId, welcomeMessage, buildTopicsKeyboard(topics));
        return new NextResponse('OK', { status: 200 });
      }

      // Handle topic completion confirmation
      if (data.startsWith('complete:')) {
        const topicId = data.replace('complete:', '');
        const topics = (bot.onboardingTopics as unknown as OnboardingTopic[]) || [];
        const topic = topics.find((t: OnboardingTopic) => t.id === topicId);

        if (topic) {
          try {
            // Save completion (upsert to avoid duplicates)
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

            // Count completions for this user
            const completedCount = await prisma.onboardingCompletion.count({
              where: {
                botId: bot.id,
                telegramChatId: String(chatId),
              },
            });

            const totalTopics = topics.length;
            const remaining = totalTopics - completedCount;

            await answerCallbackQuery(token, callbackQuery.id, `✅ ${topic.label} completed!`);

            let statusMessage = `✅ *${topic.label}* ဖတ်ပြီး/ကြည့်ပြီး မှတ်တမ်းတင်ပြီးပါပြီ!\n\n📊 Progress: ${completedCount}/${totalTopics} completed`;

            if (remaining === 0) {
              statusMessage += '\n\n🎉 Topic အားလုံး complete ပြီးပါပြီ! Well done!';
            } else {
              statusMessage += `\n\n📌 နောက်ထပ် ${remaining} ခု ကျန်ပါသေးတယ်`;
            }

            await sendTelegramMessage(token, chatId, statusMessage, buildBackToMenuKeyboard());
          } catch (err) {
            console.error('Completion save error:', err);
            await answerCallbackQuery(token, callbackQuery.id, '⚠️ Error');
          }
        } else {
          await answerCallbackQuery(token, callbackQuery.id);
        }

        return new NextResponse('OK', { status: 200 });
      }

      if (data.startsWith('onboarding:')) {
        const topicId = data.replace('onboarding:', '');
        const topics = (bot.onboardingTopics as unknown as OnboardingTopic[]) || [];
        const topic = topics.find((t: OnboardingTopic) => t.id === topicId);

        if (topic) {
          // Acknowledge with toast notification showing topic name
          await answerCallbackQuery(token, callbackQuery.id, `${topic.icon} ${topic.label}`);

          try {
            // Send "typing" indicator
            await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                action: 'typing',
              }),
            });

            // Generate AI response with the topic's specific prompt
            const topicPrompt = `User clicked on the "${topic.label}" topic button. ${topic.prompt}\n\nPlease provide a helpful, friendly, and detailed response about this topic.`;
            const aiResponse = await generateBotResponse(bot.id, topicPrompt, [], 'telegram');

            await sendTelegramMessage(
              token,
              chatId,
              `${topic.icon} *${topic.label}*\n\n${aiResponse}`,
              buildBackToMenuKeyboard(topic.id)
            );
          } catch (err) {
            console.error('Onboarding topic response error:', err);
            await sendTelegramMessage(
              token,
              chatId,
              '⚠️ တစ်ခုခု မှားသွားပါတယ်။ ထပ်ကြိုးစားကြည့်ပါ။',
              buildBackToMenuKeyboard()
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
            const welcomeMessage =
              bot.onboardingWelcome ||
              `🎉 *${bot.name}* မှ ကြိုဆိုပါတယ်!\n\nပထမဆုံးနေ့ အလုပ်ဝင်တာ ပျော်ပါတယ်! ဘယ်အကြောင်း သိချင်ပါသလဲ? 👇`;

            await sendTelegramMessage(token, chatId, welcomeMessage, buildTopicsKeyboard(topics));
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

      // Handle /menu command (show onboarding menu anytime)
      if (userMessage === '/menu') {
        if (bot.onboardingEnabled && bot.onboardingTopics) {
          const topics = bot.onboardingTopics as unknown as OnboardingTopic[];
          if (topics.length > 0) {
            await sendTelegramMessage(
              token,
              chatId,
              '📋 *Menu*\n\nဘယ်အကြောင်း သိချင်ပါသလဲ? 👇',
              buildTopicsKeyboard(topics)
            );
            return new NextResponse('OK', { status: 200 });
          }
        }
        await sendTelegramMessage(
          token,
          chatId,
          '💬 Menu မရှိပါ။ သိချင်တာ ရိုက်ပြီး မေးလို့ရပါတယ်!'
        );
        return new NextResponse('OK', { status: 200 });
      }

      // Normal AI chat for all other messages
      try {
        // Send typing indicator
        await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            action: 'typing',
          }),
        });

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
