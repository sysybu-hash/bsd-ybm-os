-- Site-wide AI cost ledger: one row per model call, in the units the
-- provider bills. Additive only; nothing existing is touched.
CREATE TABLE IF NOT EXISTS "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "imageTokens" INTEGER NOT NULL DEFAULT 0,
    "outputImages" INTEGER NOT NULL DEFAULT 0,
    "environment" TEXT NOT NULL,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- Not CONCURRENTLY: migrate deploy runs inside a transaction, and the table is new and empty.
CREATE INDEX IF NOT EXISTS "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AiUsageEvent_organizationId_createdAt_idx" ON "AiUsageEvent"("organizationId", "createdAt");
