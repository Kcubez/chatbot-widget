'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { embedDocument, deleteDocumentChunks } from '@/lib/rag';

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
  const botType = formData.get('botType') as string;
  const botCategory = formData.get('botCategory') as string;

  const bot = await prisma.bot.create({
    data: {
      name,
      systemPrompt,
      primaryColor: primaryColor || '#3b82f6',
      userId: session.user.id,
      botType: botType || 'service',
      botCategory: botCategory || 'website_bot',
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
    include: {
      documents: true,
      user: {
        select: {
          allowedChannels: true,
        },
      },
    },
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

  // Await embedding so it completes before Vercel serverless terminates
  try {
    await embedDocument(doc.id, botId, content);
  } catch (err) {
    console.error('[RAG] Failed to embed document:', err);
  }

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

  // Await re-embedding so it completes before Vercel serverless terminates
  try {
    await embedDocument(doc.id, botId, content);
  } catch (err) {
    console.error('[RAG] Failed to re-embed document:', err);
  }

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

  // Delete vector chunks first (cascade will also handle this, but be explicit)
  await deleteDocumentChunks(docId);

  await prisma.document.delete({
    where: { id: docId, botId },
  });

  revalidatePath(`/dashboard/bots/${botId}`);
}

export async function uploadDocument(botId: string, formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const file = formData.get('file') as File;
  if (!file) throw new Error('No file uploaded');

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || 'Untitled document';
  const lowerName = fileName.toLowerCase();
  const isPDF = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  const isDOCX =
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx');
  const isTXT = file.type === 'text/plain' || lowerName.endsWith('.txt');
  const isCSV =
    file.type === 'text/csv' ||
    file.type === 'application/csv' ||
    lowerName.endsWith('.csv');
  const isXLSX =
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    lowerName.endsWith('.xlsx');

  if (!isPDF && !isDOCX && !isTXT && !isCSV && !isXLSX) {
    throw new Error('Unsupported file type. Please upload a PDF, DOCX, TXT, CSV, or XLSX file.');
  }

  let content = '';

  if (isTXT || isCSV) {
    content = buffer.toString('utf8');
  }

  if (isDOCX) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      content = result.value;
    } catch (err) {
      console.error('DOCX Parse Error:', err);
      throw new Error('Failed to process DOCX. Please try again later.');
    }
  }

  if (isXLSX) {
    try {
      content = await extractXlsxText(buffer);
    } catch (err) {
      console.error('XLSX Parse Error:', err);
      throw new Error('Failed to process XLSX. Please try again later.');
    }
  }

  if (isPDF) {
    // Use Gemini AI for robust Myanmar text extraction from PDF
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const { GoogleAIFileManager } = await import('@google/generative-ai/server');
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
      const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY!);

      // Save buffer to a temporary file
      const tempFilePath = path.join(os.tmpdir(), `${Date.now()}-${fileName}`);
      await fs.writeFile(tempFilePath, buffer);

      try {
        // Upload to Gemini
        const uploadResponse = await fileManager.uploadFile(tempFilePath, {
          mimeType: 'application/pdf',
          displayName: fileName,
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
    } catch (err) {
      console.error('Gemini PDF Parse Error:', err);
      throw new Error('Failed to process PDF with AI. Please try again later.');
    }
  }

  if (!content.trim()) {
    throw new Error('Could not extract any meaningful text from the document.');
  }

  const doc = await prisma.document.create({
    data: {
      title: fileName,
      content,
      botId,
    },
  });

  // Await embedding so it completes before Vercel serverless terminates
  try {
    await embedDocument(doc.id, botId, content);
  } catch (err) {
    console.error('[RAG] Failed to embed document:', err);
  }

  revalidatePath(`/dashboard/bots/${botId}`);
  return doc;
}

export async function addKnowledgeFromUrl(botId: string, url: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const bot = await prisma.bot.findUnique({
    where: { id: botId, userId: session.user.id },
  });
  if (!bot) throw new Error('Unauthorized');

  const normalizedUrl = normalizeImportUrl(url);
  const sourceUrl = new URL(normalizedUrl);
  assertSafePublicUrl(sourceUrl);

  let fetchUrl = normalizedUrl;
  let title = sourceUrl.hostname;
  const googleDocId = extractGoogleFileId(normalizedUrl, 'document');
  const googleSheetId = extractGoogleFileId(normalizedUrl, 'spreadsheets');

  if (googleDocId) {
    fetchUrl = `https://docs.google.com/document/d/${googleDocId}/export?format=txt`;
    title = `Google Doc - ${googleDocId}`;
  } else if (googleSheetId) {
    const gid = sourceUrl.searchParams.get('gid') || '0';
    fetchUrl = `https://docs.google.com/spreadsheets/d/${googleSheetId}/export?format=csv&gid=${gid}`;
    title = `Google Sheet - ${googleSheetId}`;
  }

  const response = await fetch(fetchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 KnowledgeBotImporter/1.0',
      Accept: 'text/plain,text/csv,text/html,application/xhtml+xml,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error('Could not fetch this URL. Make sure it is publicly accessible.');
  }

  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  const content =
    googleSheetId || contentType.includes('text/csv')
      ? rawText
      : contentType.includes('text/html') || rawText.trimStart().startsWith('<')
        ? htmlToReadableText(rawText)
        : rawText;

  const finalTitle =
    googleDocId || googleSheetId
      ? title
      : extractHtmlTitle(rawText) || `${sourceUrl.hostname}${sourceUrl.pathname}`;

  if (!content.trim()) {
    throw new Error('Could not extract readable text from this URL.');
  }

  const doc = await prisma.document.create({
    data: {
      title: finalTitle,
      content: content.trim(),
      botId,
    },
  });

  try {
    await embedDocument(doc.id, botId, doc.content);
  } catch (err) {
    console.error('[RAG] Failed to embed URL knowledge:', err);
  }

  revalidatePath(`/dashboard/bots/${botId}`);
  return doc;
}

function normalizeImportUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('URL is required');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function assertSafePublicUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }

  const hostname = url.hostname.toLowerCase();
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (
    blockedHosts.includes(hostname) ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    throw new Error('Private or local URLs are not supported.');
  }
}

function extractGoogleFileId(url: string, type: 'document' | 'spreadsheets') {
  const match = url.match(new RegExp(`docs\\.google\\.com\\/${type}\\/d\\/([^/?#]+)`));
  return match?.[1] || null;
}

function extractHtmlTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeXmlEntities(match[1]).trim() : '';
}

function htmlToReadableText(html: string) {
  return decodeXmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<\/(p|div|section|article|header|footer|li|tr|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

async function extractXlsxText(buffer: Buffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('text');
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const sheetFiles = Object.keys(zip.files)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort();

  const sheets: string[] = [];
  for (const [index, fileName] of sheetFiles.entries()) {
    const xml = await zip.file(fileName)?.async('text');
    if (!xml) continue;
    const rows = parseSheetRows(xml, sharedStrings);
    if (rows.length > 0) {
      sheets.push(`Sheet ${index + 1}\n${rows.map(row => row.join(' | ')).join('\n')}`);
    }
  }

  return sheets.join('\n\n');
}

function parseSharedStrings(xml: string) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map(match =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map(textMatch => decodeXmlEntities(textMatch[1]))
      .join('')
  );
}

function parseSheetRows(xml: string, sharedStrings: string[]) {
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)]
    .map(rowMatch =>
      [...rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
        .map(cellMatch => parseSheetCell(cellMatch[1], cellMatch[2], sharedStrings))
        .filter(Boolean)
    )
    .filter(row => row.length > 0);
}

function parseSheetCell(attrs: string, innerXml: string, sharedStrings: string[]) {
  const inline = innerXml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
  if (inline) return decodeXmlEntities(inline[1]).trim();

  const valueMatch = innerXml.match(/<v[^>]*>([\s\S]*?)<\/v>/);
  if (!valueMatch) return '';

  const value = decodeXmlEntities(valueMatch[1]).trim();
  if (/\st="s"/.test(attrs)) {
    return sharedStrings[Number(value)] || '';
  }
  return value;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
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
