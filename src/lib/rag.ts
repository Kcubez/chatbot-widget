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
export function chunkText(text: string, maxChars = 500, overlap = 50): string[] {
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
  // 1. Delete old chunks for this document
  await deleteDocumentChunks(documentId);

  // 2. Chunk the text
  const chunks = chunkText(content);
  if (chunks.length === 0) return 0;

  // 3. Generate embeddings in batch
  const embeddings = await generateEmbeddings(chunks, apiKey);

  // 4. Insert chunks with embeddings using raw SQL (Prisma doesn't support vector type natively)
  for (let i = 0; i < chunks.length; i++) {
    const id = generateCuid();
    const vectorStr = `[${embeddings[i].join(',')}]`;

    await prisma.$executeRawUnsafe(
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

  // Cosine similarity search using pgvector
  const results = await prisma.$queryRawUnsafe<
    { id: string; documentId: string; title: string; content: string; similarity: number }[]
  >(
    `SELECT dc.id, dc."documentId", d.title, dc.content,
            1 - (dc.embedding <=> $1::vector) as similarity
     FROM document_chunk dc
     JOIN document d ON d.id = dc."documentId"
     WHERE dc."botId" = $2
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $3`,
    vectorStr,
    botId,
    topK
  );

  return results.map(r => ({
    id: r.id,
    documentId: r.documentId,
    title: r.title,
    content: r.content,
    similarity: Number(r.similarity),
  }));
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
