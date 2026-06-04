-- Contact semantic search index (Gemini embeddings stored as JSON)
CREATE TABLE IF NOT EXISTS "ContactSearchEmbedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactSearchEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactSearchEmbedding_contactId_key" ON "ContactSearchEmbedding"("contactId");
CREATE INDEX IF NOT EXISTS "ContactSearchEmbedding_organizationId_idx" ON "ContactSearchEmbedding"("organizationId");

DO $$ BEGIN
  ALTER TABLE "ContactSearchEmbedding" ADD CONSTRAINT "ContactSearchEmbedding_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContactSearchEmbedding" ADD CONSTRAINT "ContactSearchEmbedding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
