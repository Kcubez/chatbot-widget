/**
 * Batch-embed all existing documents for all bots using the shared RAG pipeline.
 * Run: npx tsx ./scripts/embed-all.ts
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { embedDocument } from '../src/lib/rag';

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Finding all bots with documents...\n');

  const bots = await prisma.bot.findMany({
    where: { documents: { some: {} } },
    select: {
      id: true,
      name: true,
      user: { select: { googleApiKey: true } },
      documents: { select: { id: true, content: true } },
    },
  });

  if (bots.length === 0) {
    console.log('📭 No bots with documents found.');
    return;
  }

  console.log(`📦 Found ${bots.length} bot(s) with documents:\n`);

  for (const bot of bots) {
    console.log(`🤖 Bot: "${bot.name}" (${bot.id}) — ${bot.documents.length} doc(s)`);

    let totalChunks = 0;
    const apiKey = bot.user?.googleApiKey || process.env.GOOGLE_API_KEY || '';

    for (const doc of bot.documents) {
      const chunks = await embedDocument(doc.id, bot.id, doc.content, apiKey);
      totalChunks += chunks;
      console.log(`   📄 Doc "${doc.id}" → ${chunks} chunks`);
    }

    console.log(`   ✅ Total: ${totalChunks} chunks embedded\n`);
  }

  console.log('🎉 Done!');
}

main()
  .catch(err => console.error('❌ Error:', err))
  .finally(() => prisma.$disconnect());
