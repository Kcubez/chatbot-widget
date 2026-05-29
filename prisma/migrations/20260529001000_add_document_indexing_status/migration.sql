ALTER TABLE "document"
  ADD COLUMN "indexingStatus" TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN "indexingError" TEXT,
  ADD COLUMN "indexedAt" TIMESTAMP(3);

UPDATE "document"
SET "indexingStatus" = 'ready',
    "indexedAt" = COALESCE("updatedAt", "createdAt")
WHERE "indexingStatus" = 'ready';
