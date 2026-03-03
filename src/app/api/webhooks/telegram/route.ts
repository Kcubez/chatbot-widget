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
      const data = callbackQuery.data;

      // Acknowledge the callback immediately
      await answerCallbackQuery(token, callbackQuery.id);

      if (data === 'onboarding:back_to_menu') {
        // Echo user's selection
        await sendTelegramMessage(token, chatId, '⬅️ _Menu သို့ ပြန်သွားပါမယ်_');

        // Show the onboarding menu again
        const topics = (bot.onboardingTopics as unknown as OnboardingTopic[]) || [];
        const welcomeMessage =
          bot.onboardingWelcome ||
          `🎉 *${bot.name}* မှ ကြိုဆိုပါတယ်!\n\nဘယ်အကြောင်း သိချင်ပါသလဲ? 👇`;

        await sendTelegramMessage(token, chatId, welcomeMessage, buildTopicsKeyboard(topics));
        return new NextResponse('OK', { status: 200 });
      }

      if (data.startsWith('onboarding:')) {
        const topicId = data.replace('onboarding:', '');
        const topics = (bot.onboardingTopics as unknown as OnboardingTopic[]) || [];
        const topic = topics.find((t: OnboardingTopic) => t.id === topicId);

        if (topic) {
          try {
            // Echo user's selection — shows in chat like user sent it
            await sendTelegramMessage(token, chatId, `${topic.icon} _${topic.label}_`);

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
              buildBackToMenuKeyboard()
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
        }

        return new NextResponse('OK', { status: 200 });
      }
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
