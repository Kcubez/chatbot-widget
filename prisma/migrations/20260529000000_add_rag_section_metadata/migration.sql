ALTER TABLE "document_chunk"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "sectionTitle" TEXT,
  ADD COLUMN "sectionPath" TEXT,
  ADD COLUMN "chunkType" TEXT NOT NULL DEFAULT 'paragraph';

CREATE INDEX "document_chunk_botId_parentId_idx" ON "document_chunk"("botId", "parentId");
CREATE INDEX "document_chunk_botId_sectionPath_idx" ON "document_chunk"("botId", "sectionPath");
