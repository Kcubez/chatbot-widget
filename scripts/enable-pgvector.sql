-- RAG Vector Database Migration
-- Run this AFTER `prisma db push` or `prisma migrate dev`

-- 1. Enable pgvector extension (Supabase has this pre-installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add HNSW index for fast cosine similarity search
-- This significantly speeds up vector queries on large datasets
CREATE INDEX IF NOT EXISTS document_chunk_embedding_idx
  ON document_chunk
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Note: The document_chunk table is created by Prisma migration.
-- This script adds the vector index that Prisma cannot express natively.
