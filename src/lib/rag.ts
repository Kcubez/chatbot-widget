/**
 * RAG (Retrieval-Augmented Generation) — Vector search with pgvector
 *
 * Provides chunking, embedding, and semantic search for bot documents.
 * Uses Gemini text-embedding-004 (768 dims) + pgvector cosine distance.
 *
 * Key functions:
 *  - embedDocument()          — chunk + embed a document and store in DB
 *  - searchRelevantChunks()   — vector similarity search for a query
 *  - deleteDocumentChunks()   — remove all chunks for a document
 *  - embedAllDocuments()      — batch-embed all documents for a bot
 */

import { prisma } from './prisma';

// ─── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Split text into overlapping chunks of ~maxChars characters.
 * Tries to break on sentence/paragraph boundaries for better context.
 */
export function chunkText(text: string, maxChars = 900, overlap = 150): string[] {
  if (!text || text.trim().length === 0) return [];

  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // If text is small enough, return as single chunk
  if (normalized.length <= maxChars) {
    return [normalized.trim()];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);

    // Try to break at a paragraph boundary
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + maxChars * 0.3) {
        end = paragraphBreak;
      } else {
        // Try sentence boundary (. followed by space or newline)
        const sentenceBreak = normalized.lastIndexOf('. ', end);
        if (sentenceBreak > start + maxChars * 0.3) {
          end = sentenceBreak + 1; // include the period
        } else {
          // Try any newline
          const lineBreak = normalized.lastIndexOf('\n', end);
          if (lineBreak > start + maxChars * 0.3) {
            end = lineBreak;
          }
        }
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start forward with overlap for context continuity
    start = end - overlap;
    if (start <= (chunks.length > 0 ? end - chunk.length : 0)) {
      start = end; // prevent infinite loop
    }
  }

  return chunks;
}

// ─── Section-Aware Document Chunking ──────────────────────────────────────────

interface DocumentSection {
  header: string;       // e.g. "5.2 Gold Package"
  number: string;       // e.g. "5.2"
  content: string;      // Content after the header
  parentHeader: string; // e.g. "5. Website Development Packages"
}

type DocumentChunkType = 'heading' | 'paragraph' | 'list_item' | 'table' | 'reference';

type IndexedDocumentChunk = {
  content: string;
  parentId: string;
  sectionTitle: string;
  sectionPath: string;
  chunkType: DocumentChunkType;
  chunkIndex: number;
};

/**
 * Split document text into sections by detecting numbered headers.
 * Detects patterns like "1. Company Profile", "5.2 Gold Package", etc.
 *
 * Filters out false positives from portfolio table entries (e.g., "1. Golden Diamond Eagle")
 * by checking context: real headers are preceded by blank lines and not followed by URLs.
 */
function splitIntoSections(text: string): DocumentSection[] {
  const headerRegex = /^(?:(#{1,6})\s+(.+)|(\d+(?:\.\d+)*)\.\s+(.+))$/gm;
  const candidates: {
    index: number;
    number: string;
    title: string;
    fullMatch: string;
    level: number;
    markdown: boolean;
  }[] = [];

  let match;
  while ((match = headerRegex.exec(text)) !== null) {
    const markdownMarks = match[1] || '';
    const number = match[3] || '';
    candidates.push({
      index: match.index,
      number,
      title: (match[2] || match[4] || '').trim(),
      fullMatch: match[0],
      level: markdownMarks ? markdownMarks.length : number.split('.').length,
      markdown: Boolean(markdownMarks),
    });
  }

  // Filter candidates: real document section headers vs. portfolio table entries
  const headers = candidates.filter(h => {
    // Markdown headings come from layout-aware extraction and are trusted.
    if (h.markdown) return true;

    // Sub-sections like "5.2", "6.1" are always real headers
    if (h.number.includes('.')) return true;

    // Check what follows: if a URL appears within the next 200 chars, it's a portfolio entry
    const after = text.slice(h.index + h.fullMatch.length, h.index + h.fullMatch.length + 200);
    if (/https?:\/\//.test(after.split('\n\n')[0] || '')) return false;

    // Check what precedes: real headers are preceded by double-newlines or start of text
    const before = text.slice(Math.max(0, h.index - 5), h.index);
    if (h.index > 0 && !/\n\n/.test(before) && !/^\s*$/.test(before)) return false;

    // Reject entries that look like list items (number > 9 without being a known section)
    const num = parseInt(h.number, 10);
    if (num > 9 && !h.title.toLowerCase().includes('ebook')) return false;

    return true;
  });

  if (headers.length === 0) {
    return [{ header: '', number: '', content: text.trim(), parentHeader: '' }];
  }

  // Build lookup of top-level section headers for parent resolution
  // Use the FIRST match for each number (real headers appear before portfolio entries)
  const topLevelHeaders = new Map<string, string>();
  for (const h of headers) {
    if (h.number && !h.number.includes('.') && !topLevelHeaders.has(h.number)) {
      topLevelHeaders.set(h.number, `${h.number}. ${h.title}`);
    }
  }

  const sections: DocumentSection[] = [];
  const headingStack: { level: number; header: string }[] = [];

  // Content before first header (preamble/introduction)
  if (headers[0].index > 0) {
    const preamble = text.slice(0, headers[0].index).trim();
    if (preamble.length > 20) {
      sections.push({ header: 'Introduction', number: '0', content: preamble, parentHeader: '' });
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index + headers[i].fullMatch.length;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const content = text.slice(start, end).trim();

    const fullHeader = headers[i].markdown
      ? headers[i].title
      : headers[i].number.includes('.')
      ? `${headers[i].number} ${headers[i].title}`
      : `${headers[i].number}. ${headers[i].title}`;

    // Resolve parent header for sub-sections (e.g., 5.2 → parent is 5)
    let parentHeader = '';
    if (headers[i].markdown) {
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= headers[i].level) {
        headingStack.pop();
      }
      parentHeader = headingStack[headingStack.length - 1]?.header || '';
      headingStack.push({ level: headers[i].level, header: fullHeader });
    } else if (headers[i].number.includes('.')) {
      const parentNumber = headers[i].number.split('.').slice(0, -1).join('.');
      parentHeader = topLevelHeaders.get(parentNumber) || '';
    }

    if (content.length > 0) {
      sections.push({ header: fullHeader, number: headers[i].number, content, parentHeader });
    }
  }

  return sections;
}

/**
 * Detect if a section is a portfolio/reference table (many URLs, little prose).
 */
function isPortfolioSection(content: string): boolean {
  const urlCount = (content.match(/https?:\/\//g) || []).length;
  return urlCount >= 3;
}

/**
 * Section-aware document chunking for better RAG accuracy.
 *
 * Improvements over basic chunkText():
 * 1. Splits at section headers so sections stay intact
 * 2. Prepends section path (parent > section) to each chunk
 * 3. Compacts excessive whitespace within sections
 * 4. Tags portfolio/table sections with [PORTFOLIO/REFERENCE]
 */
export function chunkDocument(text: string, maxChars = 1500, overlap = 100): string[] {
  return buildIndexedDocumentChunks(text, maxChars, overlap).map(chunk => chunk.content);
}

function buildIndexedDocumentChunks(
  text: string,
  maxChars = 1500,
  overlap = 100
): IndexedDocumentChunk[] {
  if (!text || text.trim().length === 0) return [];

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // If text is small enough, return as single chunk
  if (normalized.length <= maxChars) {
    return [{
      content: normalized.trim(),
      parentId: 'section_0_document',
      sectionTitle: 'Document',
      sectionPath: 'Document',
      chunkType: inferChunkType(normalized),
      chunkIndex: 0,
    }];
  }

  const sections = splitIntoSections(normalized);
  const chunks: IndexedDocumentChunk[] = [];

  for (const [sectionIndex, section] of sections.entries()) {
    // Compact excessive blank lines within section (3+ newlines → 2)
    const compacted = section.content.replace(/\n{3,}/g, '\n\n').trim();
    const sectionTitle = section.header || 'Document';
    const sectionPath = section.parentHeader && section.header
      ? `${section.parentHeader} > ${section.header}`
      : sectionTitle;
    const parentId = `section_${sectionIndex}_${slugify(sectionPath)}`;

    // Build section context prefix
    let prefix = '';
    if (section.parentHeader && section.header) {
      prefix = `[${section.parentHeader} > ${section.header}]\n`;
    } else if (section.header) {
      prefix = `[${section.header}]\n`;
    }

    // Tag portfolio sections
    const portfolio = isPortfolioSection(compacted);
    if (portfolio) {
      prefix = `[PORTFOLIO/REFERENCE] ${prefix}`;
    }

    const fullContent = `${prefix}${compacted}`;
    const baseChunkType = portfolio ? 'reference' : inferChunkType(compacted);

    if (fullContent.length <= maxChars) {
      chunks.push({
        content: fullContent.trim(),
        parentId,
        sectionTitle,
        sectionPath,
        chunkType: baseChunkType,
        chunkIndex: chunks.length,
      });
    } else {
      const subChunks = splitSectionIntoChildChunks(compacted, maxChars - prefix.length - 10, overlap);
      for (const sub of subChunks) {
        chunks.push({
          content: `${prefix}${sub.content}`.trim(),
          parentId,
          sectionTitle,
          sectionPath,
          chunkType: portfolio ? 'reference' : sub.chunkType,
          chunkIndex: chunks.length,
        });
      }
    }
  }

  return chunks.filter(c => c.content.length > 0);
}

function splitSectionIntoChildChunks(
  content: string,
  maxChars: number,
  overlap: number
): { content: string; chunkType: DocumentChunkType }[] {
  const blocks = content
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  const chunks: { content: string; chunkType: DocumentChunkType }[] = [];
  for (const block of blocks) {
    const chunkType = inferChunkType(block);
    if (block.length <= maxChars) {
      chunks.push({ content: block, chunkType });
      continue;
    }

    const subChunks = chunkText(block, maxChars, overlap);
    chunks.push(...subChunks.map(sub => ({ content: sub, chunkType })));
  }

  return chunks.length > 0 ? chunks : [{ content, chunkType: inferChunkType(content) }];
}

function inferChunkType(content: string): DocumentChunkType {
  const trimmed = content.trim();
  const lines = trimmed.split('\n').filter(Boolean);
  const listLines = lines.filter(line => /^\s*(?:[-*•✓✅➡️]|\d+[.)])\s+/.test(line)).length;
  if (/^\s*\|.+\|\s*$/m.test(trimmed)) return 'table';
  if (listLines > 0 && listLines >= Math.max(1, Math.ceil(lines.length * 0.4))) return 'list_item';
  if (/^#{1,6}\s+/.test(trimmed) || /^\d+(?:\.\d+)*\.\s+\S+/.test(trimmed)) return 'heading';
  return 'paragraph';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'document';
}

// ─── Embedding ────────────────────────────────────────────────────────────────

/**
 * Generate a 768-dim embedding vector using Gemini gemini-embedding-001.
 * Uses the new @google/genai SDK (replaces deprecated @google/generative-ai).
 */
export async function generateEmbedding(
  text: string,
  apiKey?: string
): Promise<number[]> {
  const key = apiKey || process.env.GOOGLE_API_KEY || '';
  if (!key) throw new Error('No API key for embedding generation');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: key });

  const response = await embedContentWithRetry(ai, {
    model: 'gemini-embedding-001',
    contents: text,
    config: { outputDimensionality: 768 },
  });

  return response.embeddings![0].values!;
}

/**
 * Generate embeddings for multiple texts.
 * Calls embedContent per text (batch not yet supported in new SDK).
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey?: string
): Promise<number[][]> {
  const key = apiKey || process.env.GOOGLE_API_KEY || '';
  if (!key) throw new Error('No API key for embedding generation');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: key });

  const results: number[][] = [];
  for (const text of texts) {
    const response = await embedContentWithRetry(ai, {
      model: 'gemini-embedding-001',
      contents: text,
      config: { outputDimensionality: 768 },
    });
    results.push(response.embeddings![0].values!);
    await sleep(embeddingRequestDelayMs());
  }

  return results;
}

async function embedContentWithRetry(
  ai: any,
  request: {
    model: string;
    contents: string;
    config: { outputDimensionality: number };
  }
) {
  let lastError: any;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await ai.models.embedContent(request);
    } catch (err: any) {
      lastError = err;
      const retryDelayMs = extractRetryDelayMs(err);
      const retryable = err?.status === 429 || err?.status === 503 || retryDelayMs > 0;
      if (!retryable || attempt === 4) throw err;
      await sleep(Math.max(retryDelayMs, 1000 * attempt));
    }
  }
  throw lastError;
}

function extractRetryDelayMs(err: any): number {
  const retryDelay = err?.error?.details?.find?.((detail: any) => detail?.retryDelay)?.retryDelay;
  if (typeof retryDelay === 'string') {
    const seconds = Number(retryDelay.replace(/s$/, ''));
    if (Number.isFinite(seconds)) return seconds * 1000;
  }

  const message = String(err?.message || '');
  const match = message.match(/retry in ([\d.]+)s/i);
  return match ? Number(match[1]) * 1000 : 0;
}

function embeddingRequestDelayMs(): number {
  const configured = Number(process.env.RAG_EMBED_DELAY_MS);
  return Number.isFinite(configured) ? configured : 750;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Document Embedding Pipeline ──────────────────────────────────────────────

/**
 * Chunk a document's content, generate embeddings, and store in DocumentChunk table.
 * Deletes existing chunks for this document first (idempotent).
 */
export async function embedDocument(
  documentId: string,
  botId: string,
  content: string,
  apiKey?: string
): Promise<number> {
  // 1. Chunk the text using section-aware chunking for better accuracy
  const chunks = buildIndexedDocumentChunks(content);
  if (chunks.length === 0) return 0;

  // 2. Generate embeddings before touching existing chunks. This prevents a
  // failed re-embed from deleting the last good searchable index.
  const embeddings = await generateEmbeddings(chunks.map(chunk => chunk.content), apiKey);

  // 3. Replace chunks atomically.
  await prisma.$transaction(
    async tx => {
      await tx.$executeRawUnsafe(
        `DELETE FROM document_chunk WHERE "documentId" = $1`,
        documentId
      );

      for (let i = 0; i < chunks.length; i++) {
        const id = generateCuid();
        const vectorStr = `[${embeddings[i].join(',')}]`;

        await tx.$executeRawUnsafe(
          `INSERT INTO document_chunk (
             id, "documentId", "botId", content, embedding, "chunkIndex",
             "parentId", "sectionTitle", "sectionPath", "chunkType", "createdAt"
           )
           VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, $10, NOW())`,
          id,
          documentId,
          botId,
          chunks[i].content,
          vectorStr,
          chunks[i].chunkIndex,
          chunks[i].parentId,
          chunks[i].sectionTitle,
          chunks[i].sectionPath,
          chunks[i].chunkType
        );
      }
    },
    { timeout: 60_000 }
  );

  console.log(
    `[RAG] Embedded document ${documentId}: ${chunks.length} chunks created`
  );
  return chunks.length;
}

/**
 * Delete all chunks for a document.
 */
export async function deleteDocumentChunks(documentId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM document_chunk WHERE "documentId" = $1`,
    documentId
  );
}

/**
 * Batch-embed all documents for a bot. Useful for initial migration.
 */
export async function embedAllDocuments(
  botId: string,
  apiKey?: string
): Promise<{ total: number; chunks: number }> {
  const documents = await prisma.document.findMany({
    where: { botId },
    select: { id: true, content: true },
  });

  let totalChunks = 0;
  for (const doc of documents) {
    const count = await embedDocument(doc.id, botId, doc.content, apiKey);
    totalChunks += count;
  }

  console.log(
    `[RAG] Batch embed for bot ${botId}: ${documents.length} docs → ${totalChunks} chunks`
  );
  return { total: documents.length, chunks: totalChunks };
}

// ─── Semantic Search ──────────────────────────────────────────────────────────

export type ChunkSearchResult = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  similarity: number;
  parentId?: string | null;
  sectionTitle?: string | null;
  sectionPath?: string | null;
  chunkType?: string | null;
};

/**
 * Search for the most relevant document chunks using vector cosine similarity.
 * Returns the top-K most relevant chunks for the given query.
 *
 * Falls back to returning all document content (old behavior) if no chunks exist.
 */
export async function searchRelevantChunks(
  botId: string,
  query: string,
  topK = 8,
  apiKey?: string
): Promise<ChunkSearchResult[]> {
  // Check if any chunks exist for this bot
  const chunkCount = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*)::bigint as count FROM document_chunk WHERE "botId" = $1`,
    botId
  );

  const count = Number(chunkCount[0]?.count || 0);

  if (count === 0) {
    // No chunks exist — fall back to loading all documents (legacy behavior)
    // This ensures the bot still works before documents are embedded
    return fallbackToFullDocuments(botId);
  }

  // Translate Myanmar queries to English for better embedding similarity
  const { original, translated } = await translateQueryIfMyanmar(query, apiKey);

  // Generate embedding using translated query for better cross-language similarity
  const queryEmbedding = await generateEmbedding(translated, apiKey);
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  // Keyword search: use original query (buildKeywordTerms handles Myanmar→English priority terms)
  const candidateLimit = Math.max(topK * 3, 12);
  const keywordResults = await searchKeywordChunks(botId, original, candidateLimit);
  const documentKeywordResults = await searchKeywordDocumentSnippets(botId, original, topK);

  // Also do keyword search with translated query for additional matches
  if (original !== translated) {
    const translatedKw = await searchKeywordChunks(botId, translated, candidateLimit);
    const translatedDocKw = await searchKeywordDocumentSnippets(botId, translated, topK);
    keywordResults.push(...translatedKw);
    documentKeywordResults.push(...translatedDocKw);
  }

  // Cosine similarity search using pgvector
  const vectorResults = await prisma.$queryRawUnsafe<
    RawChunkSearchRow[]
  >(
    `SELECT dc.id, dc."documentId", d.title, dc.content, dc."parentId",
            dc."sectionTitle", dc."sectionPath", dc."chunkType",
            1 - (dc.embedding <=> $1::vector) as similarity
     FROM document_chunk dc
     JOIN document d ON d.id = dc."documentId"
     WHERE dc."botId" = $2
       AND 1 - (dc.embedding <=> $1::vector) >= $4
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $3`,
    vectorStr,
    botId,
    candidateLimit,
    minVectorSimilarity()
  );

  const mergedCandidates = mergeChunkResults(
    [...documentKeywordResults, ...keywordResults],
    vectorResults
  );
  const broadListQuery = isBroadListQuery(original) || isBroadListQuery(translated);
  const merged = broadListQuery
    ? await expandSiblingChunks(botId, mergedCandidates, topK)
    : mergedCandidates.slice(0, topK);

  if (process.env.RAG_DEBUG === 'true') {
    console.log(
      `[RAG] bot=${botId} query="${original.slice(0, 60)}"${original !== translated ? ` translated="${translated.slice(0, 60)}"` : ''} broad=${broadListQuery} results=${merged
        .map(r => `${r.title}:${r.similarity.toFixed(3)}:${r.content.slice(0, 80).replace(/\s+/g, ' ')}`)
        .join(' | ')}`
    );
  }

  return merged.map(r => ({
    id: r.id,
    documentId: r.documentId,
    title: r.title,
    content: r.content,
    similarity: Number(r.similarity),
    parentId: r.parentId,
    sectionTitle: r.sectionTitle,
    sectionPath: r.sectionPath,
    chunkType: r.chunkType,
  }));
}

type RawChunkSearchRow = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  similarity: number;
  parentId?: string | null;
  sectionTitle?: string | null;
  sectionPath?: string | null;
  chunkType?: string | null;
};

async function searchKeywordDocumentSnippets(
  botId: string,
  query: string,
  topK: number
): Promise<
  RawChunkSearchRow[]
> {
  const terms = buildKeywordTerms(query);
  if (terms.length === 0) return [];

  const likeParams = terms.map(term => `%${term}%`);
  const scoreSql = likeParams
    .map((_, index) => `CASE WHEN d.content ILIKE $${index + 1} THEN 1 ELSE 0 END`)
    .join(' + ');
  const whereSql = likeParams
    .map((_, index) => `d.content ILIKE $${index + 1}`)
    .join(' OR ');
  const botParam = likeParams.length + 1;
  const limitParam = likeParams.length + 2;

  const documents = await prisma.$queryRawUnsafe<
    { id: string; title: string; content: string; score: number }[]
  >(
    `SELECT d.id, d.title, d.content, (${scoreSql})::float as score
     FROM document d
     WHERE d."botId" = $${botParam}
       AND (${whereSql})
     ORDER BY (${scoreSql}) DESC, d."updatedAt" DESC
     LIMIT $${limitParam}`,
    ...likeParams,
    botId,
    topK
  );

  return documents.map(doc => ({
    id: `doc_${doc.id}_keyword`,
    documentId: doc.id,
    title: doc.title,
    content: extractBestSnippet(doc.content, terms),
    similarity: 2 + Number(doc.score || 0),
  }));
}

async function searchKeywordChunks(
  botId: string,
  query: string,
  topK: number
): Promise<
  RawChunkSearchRow[]
> {
  const terms = buildKeywordTerms(query);
  if (terms.length === 0) return [];

  const likeParams = terms.map(term => `%${term}%`);
  const scoreSql = likeParams
    .map((_, index) => `CASE WHEN dc.content ILIKE $${index + 1} THEN 1 ELSE 0 END`)
    .join(' + ');
  const whereSql = likeParams
    .map((_, index) => `dc.content ILIKE $${index + 1}`)
    .join(' OR ');
  const botParam = likeParams.length + 1;
  const limitParam = likeParams.length + 2;

  return prisma.$queryRawUnsafe(
    `SELECT dc.id, dc."documentId", d.title, dc.content, dc."parentId",
            dc."sectionTitle", dc."sectionPath", dc."chunkType",
            (${scoreSql})::float as similarity
     FROM document_chunk dc
     JOIN document d ON d.id = dc."documentId"
     WHERE dc."botId" = $${botParam}
       AND (${whereSql})
     ORDER BY (${scoreSql}) DESC, dc."chunkIndex" ASC
     LIMIT $${limitParam}`,
    ...likeParams,
    botId,
    topK
  );
}

function buildKeywordTerms(query: string): string[] {
  const normalized = query.toLowerCase();
  const priorityTerms: string[] = [];
  const terms = normalized
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .split(/\s+/)
    .filter(term => term.length >= 3);

  if (/\b(phone|mobile|tel|telephone|call|contact)\b/i.test(query) || /ဖုန်း|ဖုန်းနံပါတ်|ဆက်သွယ်/.test(query)) {
    priorityTerms.push('phone number', 'phone', 'mobile', 'telephone', '+95');
  }
  if (/\b(email|mail)\b/i.test(query) || /အီးမေးလ်|အီးမေး|မေးလ်|အီးမေးလ်လိပ်စာ/.test(query)) {
    priorityTerms.push('email', 'mail');
  }
  if (/\b(address|location|office)\b/i.test(query) || /လိပ်စာ|ရုံးလိပ်စာ|တည်နေရာ|နေရာ/.test(query)) {
    priorityTerms.push('address', 'office');
  }
  if (/ကုမ္ပဏီ|လုပ်ငန်း|အဖွဲ့အစည်း/.test(query)) {
    priorityTerms.push('company', 'company name', 'MOT', 'Myanmar Online Technology');
  }
  if (/\b(ai|artificial intelligence)\b/i.test(query) || /AI|အေအိုင်|ဉာဏ်ရည်တု/i.test(query)) {
    priorityTerms.push('AI', 'artificial intelligence', 'service', 'services');
  }
  if (/\b(service|services|package|packages|product|products)\b/i.test(query) || /ဝန်ဆောင်မှု|ဆားဗစ်|ပက်ကေ့|ပါကေ့|ထုတ်ကုန်/.test(query)) {
    priorityTerms.push('service', 'services', 'package', 'packages', 'product', 'products');
  }

  return Array.from(new Set([...priorityTerms, ...terms])).slice(0, 12);
}

function isBroadListQuery(query: string): boolean {
  return (
    /\b(all|list|full list|complete list|available|include|included|services|packages|products|what are|which)\b/i.test(query) ||
    /ဘာတွေ|ဘာများ|ဘယ်.*တွေ|အကုန်|အားလုံး|စာရင်း|ရှိလဲ|ရှိသလဲ|ပါလဲ|ပါသလဲ|ဝန်ဆောင်မှု|ဆားဗစ်|ပက်ကေ့|ပါကေ့/.test(query)
  );
}

async function expandSiblingChunks(
  botId: string,
  candidates: RawChunkSearchRow[],
  topK: number
): Promise<RawChunkSearchRow[]> {
  const seedParentIds = Array.from(
    new Set(
      candidates
        .filter(candidate => candidate.parentId && candidate.id.startsWith('chk_'))
        .slice(0, Math.max(topK, 8))
        .map(candidate => candidate.parentId as string)
    )
  ).slice(0, 3);

  if (seedParentIds.length === 0) return candidates.slice(0, topK);

  const parentParams = seedParentIds.map((_, index) => `$${index + 2}`).join(', ');
  const siblings = await prisma.$queryRawUnsafe<RawChunkSearchRow[]>(
    `SELECT dc.id, dc."documentId", d.title, dc.content, dc."parentId",
            dc."sectionTitle", dc."sectionPath", dc."chunkType",
            1.0::float as similarity
     FROM document_chunk dc
     JOIN document d ON d.id = dc."documentId"
     WHERE dc."botId" = $1
       AND dc."parentId" IN (${parentParams})
     ORDER BY dc."documentId", dc."parentId", dc."chunkIndex" ASC`,
    botId,
    ...seedParentIds
  );

  return trimContextBudget(mergeChunkResults(siblings, candidates), 14000);
}

function trimContextBudget(results: RawChunkSearchRow[], maxChars: number): RawChunkSearchRow[] {
  const trimmed: RawChunkSearchRow[] = [];
  let total = 0;
  for (const result of results) {
    const nextTotal = total + result.content.length;
    if (trimmed.length > 0 && nextTotal > maxChars) break;
    trimmed.push(result);
    total = nextTotal;
  }
  return trimmed;
}

function extractBestSnippet(content: string, terms: string[], maxChars = 1200): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lower = normalized.toLowerCase();
  const firstHit = terms.reduce<number | undefined>((best, term) => {
    if (best !== undefined) return best;
    const index = lower.indexOf(term.toLowerCase());
    return index >= 0 ? index : undefined;
  }, undefined);

  if (firstHit === undefined) return normalized.slice(0, maxChars).trim();

  const windowStart = Math.max(0, firstHit - Math.floor(maxChars * 0.35));
  const paragraphStart = normalized.lastIndexOf('\n\n', windowStart);
  const start = paragraphStart >= 0 ? paragraphStart + 2 : windowStart;
  const end = Math.min(normalized.length, start + maxChars);
  const paragraphEnd = normalized.indexOf('\n\n', end);

  return normalized
    .slice(start, paragraphEnd > end && paragraphEnd - start <= maxChars * 1.3 ? paragraphEnd : end)
    .trim();
}

function minVectorSimilarity() {
  const configured = Number(process.env.RAG_MIN_VECTOR_SIMILARITY);
  return Number.isFinite(configured) ? configured : 0.5;
}

function mergeChunkResults(
  preferred: RawChunkSearchRow[],
  fallback: RawChunkSearchRow[]
) {
  const seen = new Set<string>();
  const merged: RawChunkSearchRow[] = [];
  for (const result of [...preferred, ...fallback]) {
    const key = result.id.startsWith('doc_') ? `${result.documentId}:${result.content}` : result.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(result);
  }
  return merged;
}

/**
 * Fallback: load all documents as "chunks" when no embeddings exist yet.
 * This preserves backward compatibility during migration.
 */
async function fallbackToFullDocuments(
  botId: string
): Promise<ChunkSearchResult[]> {
  const documents = await prisma.document.findMany({
    where: { botId },
    select: { id: true, title: true, content: true },
  });

  return documents.map(doc => ({
    id: doc.id,
    documentId: doc.id,
    title: doc.title,
    content: doc.content,
    similarity: 1.0, // full match since we're returning everything
  }));
}

// ─── Query Translation ────────────────────────────────────────────────────────

/**
 * Translate Myanmar text to English for better embedding similarity.
 * Only translates if the query contains Myanmar script (U+1000–U+109F).
 * Uses a fast, cheap model for translation.
 */
async function translateQueryIfMyanmar(
  query: string,
  apiKey?: string
): Promise<{ original: string; translated: string }> {
  // Check if query contains Myanmar Unicode block
  if (!/[\u1000-\u109F]/.test(query)) {
    return { original: query, translated: query };
  }

  try {
    const key = apiKey || process.env.GOOGLE_API_KEY || '';
    if (!key) return { original: query, translated: query };

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: `Translate this Myanmar/Burmese text to English. Return ONLY the English translation, nothing else:\n"${query}"`,
    });

    const translated = response.text?.trim();
    if (translated && translated.length > 0 && translated !== query) {
      console.log(`[RAG] Translated Myanmar query: "${query}" → "${translated}"`);
      return { original: query, translated };
    }
    return { original: query, translated: query };
  } catch (err) {
    console.warn('[RAG] Myanmar translation failed, using original query:', err);
    return { original: query, translated: query };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simple CUID-like ID generator for raw SQL inserts */
function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `chk_${timestamp}${random}`;
}
