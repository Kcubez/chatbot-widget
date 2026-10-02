import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export class MessengerPageConflictError extends Error {
  constructor(botName?: string) {
    super(botName
      ? `This Facebook Page is already connected to your bot "${botName}". Open that bot and disconnect its Facebook Page first. Turning the bot off does not disconnect the Page.`
      : 'This Facebook Page is already connected to another bot. Choose a different Page or disconnect it from the current bot first.');
    this.name = 'MessengerPageConflictError';
  }
}

// All Page assignments use this path. The database unique constraint also
// protects simultaneous requests and writes from outside these APIs.
export async function updateOwnedBot(botId: string, userId: string, data: Prisma.BotUpdateInput) {
  const bot = await prisma.bot.findFirst({ where: { id: botId, userId }, select: { id: true } });
  if (!bot) throw new Error('Unauthorized');

  const update = { ...data };
  if (update.messengerPageId !== undefined && update.messengerPageId !== null) {
    if (typeof update.messengerPageId !== 'string' || !/^\d+$/.test(update.messengerPageId.trim())) {
      throw new Error('Invalid Facebook Page ID');
    }
    update.messengerPageId = update.messengerPageId.trim();
    const existing = await prisma.bot.findFirst({
      where: { messengerPageId: update.messengerPageId, id: { not: botId } },
      select: { userId: true, name: true },
    });
    if (existing) throw new MessengerPageConflictError(existing.userId === userId ? existing.name : undefined);
  }

  try {
    return await prisma.bot.update({ where: { id: botId, userId }, data: update });
  } catch (error) {
    if (update.messengerPageId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new MessengerPageConflictError();
    }
    throw error;
  }
}
