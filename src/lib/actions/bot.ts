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

export async function addDocument(botId: string, content: string, title?: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const doc = await prisma.document.create({
    data: {
      title: title || 'Text Knowledge',
      content,
      botId,
    },
  });

  revalidatePath(`/dashboard/bots/${botId}`);
  return doc;
}

export async function updateDocument(
  docId: string,
  botId: string,
  content: string,
  title?: string
) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  // Verify ownership
  const bot = await prisma.bot.findUnique({
    where: { id: botId, userId: session.user.id },
  });
  if (!bot) throw new Error('Unauthorized');

  const doc = await prisma.document.update({
    where: { id: docId, botId },
    data: {
      content,
      ...(title ? { title } : {}),
    },
  });

  revalidatePath(`/dashboard/bots/${botId}`);
  return doc;
}

export async function deleteDocument(docId: string, botId: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  // Verify ownership
  const bot = await prisma.bot.findUnique({
    where: { id: botId, userId: session.user.id },
  });
  if (!bot) throw new Error('Unauthorized');

  await prisma.document.delete({
    where: { id: docId, botId },
  });

  revalidatePath(`/dashboard/bots/${botId}`);
}

export async function uploadPDF(botId: string, formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const file = formData.get('file') as File;
  if (!file) throw new Error('No file uploaded');

  const buffer = Buffer.from(await file.arrayBuffer());

  // Use Gemini AI for robust Myanmar text extraction from PDF
  let content = '';
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { GoogleAIFileManager } = await import('@google/generative-ai/server');
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY!);

    // Save buffer to a temporary file
    const tempFilePath = path.join(os.tmpdir(), `${Date.now()}-${file.name}`);
    await fs.writeFile(tempFilePath, buffer);

    try {
      // Upload to Gemini
      const uploadResponse = await fileManager.uploadFile(tempFilePath, {
        mimeType: 'application/pdf',
        displayName: file.name,
      });

      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent([
        {
          fileData: {
            mimeType: uploadResponse.file.mimeType,
            fileUri: uploadResponse.file.uri,
          },
        },
        {
          text: 'Extract all the text from this PDF accurately. If there is Myanmar text, ensure it is correctly transcribed into Unicode. Return only the extracted text content.',
        },
      ]);

      content = result.response.text();

      // Delete remote file from Gemini
      await fileManager.deleteFile(uploadResponse.file.name);
    } finally {
      // Clean up local temp file
      await fs.unlink(tempFilePath).catch(console.error);
    }
  } catch (err: any) {
    console.error('Gemini PDF Parse Error:', err);
    throw new Error('Failed to process PDF with AI. Please try again later.');
  }

  if (!content.trim()) {
    throw new Error('Could not extract any meaningful text from the PDF.');
  }

  const doc = await prisma.document.create({
    data: {
      title: file.name,
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
