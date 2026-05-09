/**
 * Batch-embed all existing documents for all bots.
 * Run: npx tsx ./scripts/embed-all.ts
 */

import pg from 'pg';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL!;
const API_KEY = process.env.GOOGLE_API_KEY!;

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const ai = new GoogleGenAI({ apiKey: API_KEY });

// ─── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text: string, maxChars = 500, overlap = 50): string[] {
  if (!text || text.trim().length === 0) return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.length <= maxChars) return [normalized.trim()];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      const pb = normalized.lastIndexOf('\n\n', end);
      if (pb > start + maxChars * 0.3) { end = pb; }
      else {
        const sb = normalized.lastIndexOf('. ', end);
        if (sb > start + maxChars * 0.3) { end = sb + 1; }
        else {
          const lb = normalized.lastIndexOf('\n', end);
          if (lb > start + maxChars * 0.3) { end = lb; }
        }
      }
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end - overlap;
    if (start <= (chunks.length > 0 ? end - chunk.length : 0)) start = end;
  }
  return chunks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Finding all bots with documents...\n');

  const { rows: bots } = await pool.query(`
    SELECT b.id, b.name, COUNT(d.id)::int as doc_count
    FROM bot b
    JOIN document d ON d.\"botId\" = b.id
    GROUP BY b.id, b.name
  `);

  if (bots.length === 0) {
    console.log('📭 No bots with documents found.');
    return;
  }

  console.log(`📦 Found ${bots.length} bot(s) with documents:\n`);

  for (const bot of bots) {
    console.log(`🤖 Bot: "${bot.name}" (${bot.id}) — ${bot.doc_count} doc(s)`);

    // Fetch all documents for this bot
    const { rows: docs } = await pool.query(
      `SELECT id, content FROM document WHERE "botId" = $1`,
      [bot.id]
    );

    let totalChunks = 0;

    for (const doc of docs) {
      // Delete old chunks
      await pool.query(`DELETE FROM document_chunk WHERE "documentId" = $1`, [doc.id]);

      // Chunk the text
      const chunks = chunkText(doc.content);
      if (chunks.length === 0) continue;

      // Embed each chunk
      const embeddings: number[][] = [];
      for (const chunk of chunks) {
        const response = await ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: chunk,
          config: { outputDimensionality: 768 },
        });
        embeddings.push(response.embeddings![0].values!);
      }

      // Insert chunks
      for (let i = 0; i < chunks.length; i++) {
        const id = `chk_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;
        const vectorStr = `[${embeddings[i].join(',')}]`;

        await pool.query(
          `INSERT INTO document_chunk (id, "documentId", "botId", content, embedding, "chunkIndex", "createdAt")
           VALUES ($1, $2, $3, $4, $5::vector, $6, NOW())`,
          [id, doc.id, bot.id, chunks[i], vectorStr, i]
        );
      }

      totalChunks += chunks.length;
      console.log(`   📄 Doc "${doc.id}" → ${chunks.length} chunks`);
    }

    console.log(`   ✅ Total: ${totalChunks} chunks embedded\n`);
  }

  console.log('🎉 Done!');
}

main()
  .catch(err => console.error('❌ Error:', err))
  .finally(() => pool.end());
