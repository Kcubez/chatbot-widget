'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

async function getSession() {
  return await auth.api.getSession({
    headers: await headers(),
  });
}

export async function createBot(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const name = formData.get('name') as string;
  const systemPrompt = formData.get('systemPrompt') as string;
  const primaryColor = formData.get('primaryColor') as string;

  const bot = await prisma.bot.create({
    data: {
      name,
      systemPrompt,
      primaryColor: primaryColor || '#3b82f6',
      userId: session.user.id,
    },
  });

  revalidatePath('/dashboard/bots');
  return bot;
}

export async function getBots() {
  const session = await getSession();
  if (!session) return [];

  return await prisma.bot.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getBotById(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  return await prisma.bot.findUnique({
    where: { id, userId: session.user.id },
    include: { documents: true },
  });
}

export async function getPublicBotById(id: string) {
  return await prisma.bot.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      primaryColor: true,
    },
  });
}

export async function updateBot(id: string, data: any) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const bot = await prisma.bot.update({
    where: { id, userId: session.user.id },
    data,
  });

  revalidatePath(`/dashboard/bots/${id}`);
  revalidatePath('/dashboard/bots');
  return bot;
}

export async function deleteBot(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  await prisma.bot.delete({
    where: { id, userId: session.user.id },
  });

  revalidatePath('/dashboard/bots');
}

export async function addDocument(botId: string, content: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const doc = await prisma.document.create({
    data: {
      content,
      botId,
    },
  });

  revalidatePath(`/dashboard/bots/${botId}`);
  return doc;
}

export async function getConversations() {
  const session = await getSession();
  if (!session) return [];

  return await prisma.conversation.findMany({
    where: {
      bot: { userId: session.user.id },
    },
    include: {
      bot: {
        select: { name: true, primaryColor: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
