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

import { prisma } from '@/lib/prisma';

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

  const response = await ai.models.embedContent({
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
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: { outputDimensionality: 768 },
    });
    results.push(response.embeddings![0].values!);
  }

  return results;
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
  // 1. Chunk the text
  const chunks = chunkText(content);
  if (chunks.length === 0) return 0;

  // 2. Generate embeddings before touching existing chunks. This prevents a
  // failed re-embed from deleting the last good searchable index.
  const embeddings = await generateEmbeddings(chunks, apiKey);

  // 3. Replace chunks atomically.
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(
      `DELETE FROM document_chunk WHERE "documentId" = $1`,
      documentId
    );

    for (let i = 0; i < chunks.length; i++) {
      const id = generateCuid();
      const vectorStr = `[${embeddings[i].join(',')}]`;

      await tx.$executeRawUnsafe(
        `INSERT INTO document_chunk (id, "documentId", "botId", content, embedding, "chunkIndex", "createdAt")
         VALUES ($1, $2, $3, $4, $5::vector, $6, NOW())`,
        id,
        documentId,
        botId,
        chunks[i],
        vectorStr,
        i
      );
    }
  });

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
  topK = 5,
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

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query, apiKey);
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  const keywordResults = await searchKeywordChunks(botId, query, topK);
  const documentKeywordResults = await searchKeywordDocumentSnippets(botId, query, topK);

  // Cosine similarity search using pgvector
  const vectorResults = await prisma.$queryRawUnsafe<
    { id: string; documentId: string; title: string; content: string; similarity: number }[]
  >(
    `SELECT dc.id, dc."documentId", d.title, dc.content,
            1 - (dc.embedding <=> $1::vector) as similarity
     FROM document_chunk dc
     JOIN document d ON d.id = dc."documentId"
     WHERE dc."botId" = $2
       AND 1 - (dc.embedding <=> $1::vector) >= $4
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $3`,
    vectorStr,
    botId,
    Math.max(topK * 2, 10),
    minVectorSimilarity()
  );

  const merged = mergeChunkResults(
    [...documentKeywordResults, ...keywordResults],
    vectorResults
  ).slice(0, topK);

  if (process.env.RAG_DEBUG === 'true') {
    console.log(
      `[RAG] bot=${botId} query="${query.slice(0, 120)}" results=${merged
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
  }));
}

async function searchKeywordDocumentSnippets(
  botId: string,
  query: string,
  topK: number
): Promise<
  { id: string; documentId: string; title: string; content: string; similarity: number }[]
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
  { id: string; documentId: string; title: string; content: string; similarity: number }[]
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
    `SELECT dc.id, dc."documentId", d.title, dc.content,
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

  if (/\b(phone|mobile|tel|telephone|call|contact)\b/i.test(query)) {
    priorityTerms.push('phone number', 'phone', 'mobile', 'telephone', '+95');
  }
  if (/\b(email|mail)\b/i.test(query)) {
    priorityTerms.push('email', 'mail');
  }
  if (/\b(address|location|office)\b/i.test(query)) {
    priorityTerms.push('address', 'office');
  }

  return Array.from(new Set([...priorityTerms, ...terms])).slice(0, 12);
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
  preferred: { id: string; documentId: string; title: string; content: string; similarity: number }[],
  fallback: { id: string; documentId: string; title: string; content: string; similarity: number }[]
) {
  const seen = new Set<string>();
  const merged = [];
  for (const result of [...preferred, ...fallback]) {
    if (seen.has(result.id)) continue;
    seen.add(result.id);
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simple CUID-like ID generator for raw SQL inserts */
function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `chk_${timestamp}${random}`;
}
