-- pgvector extension + optional native vector columns (dual-write with JSON fallback)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "KnowledgeVaultChunk"
  ADD COLUMN IF NOT EXISTS "embeddingVector" vector(768);

ALTER TABLE "ContactSearchEmbedding"
  ADD COLUMN IF NOT EXISTS "embeddingVector" vector(768);

-- HNSW indexes (work on empty tables; better than IVFFlat for cold start)
CREATE INDEX IF NOT EXISTS "KnowledgeVaultChunk_embeddingVector_idx"
  ON "KnowledgeVaultChunk"
  USING hnsw ("embeddingVector" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "ContactSearchEmbedding_embeddingVector_idx"
  ON "ContactSearchEmbedding"
  USING hnsw ("embeddingVector" vector_cosine_ops);
