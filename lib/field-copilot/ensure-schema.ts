import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("field-copilot/ensure-schema");

let ensured = false;
let ensurePromise: Promise<boolean> | null = null;

const FIELD_COPILOT_DDL_IDEMPOTENT = `
DO $$ BEGIN
  CREATE TYPE "FieldCopilotSessionStatus" AS ENUM ('DRAFT', 'ANALYZING', 'READY', 'HANDED_OFF', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "FieldCopilotSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT,
    "projectId" TEXT,
    "contactName" TEXT,
    "projectName" TEXT,
    "constructionTrade" TEXT,
    "transcript" TEXT,
    "userNotes" TEXT,
    "videoAssetId" TEXT,
    "analysisJson" JSONB,
    "scopeSummary" TEXT,
    "assumptionsJson" JSONB NOT NULL DEFAULT '[]',
    "status" "FieldCopilotSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "handedOffAt" TIMESTAMP(3),
    "issuedDocumentId" TEXT,
    "quoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldCopilotSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FieldCopilotAsset" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldCopilotAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FieldCopilotSession_organizationId_userId_idx" ON "FieldCopilotSession"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "FieldCopilotSession_organizationId_status_idx" ON "FieldCopilotSession"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "FieldCopilotSession_organizationId_createdAt_idx" ON "FieldCopilotSession"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "FieldCopilotAsset_sessionId_idx" ON "FieldCopilotAsset"("sessionId");
CREATE INDEX IF NOT EXISTS "FieldCopilotAsset_organizationId_idx" ON "FieldCopilotAsset"("organizationId");

DO $$ BEGIN
  ALTER TABLE "FieldCopilotSession" ADD CONSTRAINT "FieldCopilotSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FieldCopilotSession" ADD CONSTRAINT "FieldCopilotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FieldCopilotAsset" ADD CONSTRAINT "FieldCopilotAsset_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FieldCopilotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`;

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

/**
 * Ensures FieldCopilot tables exist (idempotent DDL).
 * Used when migrate deploy was skipped — avoids hard P2021 in prod.
 */
export async function ensureFieldCopilotSchema(): Promise<boolean> {
  if (ensured) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    try {
      if (await tableExists("FieldCopilotSession")) {
        ensured = true;
        return true;
      }

      log.warn("FieldCopilotSession missing — applying idempotent DDL");
      await prisma.$executeRawUnsafe(FIELD_COPILOT_DDL_IDEMPOTENT);

      if (!(await tableExists("FieldCopilotSession"))) {
        log.error("FieldCopilot DDL did not create FieldCopilotSession");
        return false;
      }

      ensured = true;
      log.info("FieldCopilot schema ensured");
      return true;
    } catch (err: unknown) {
      log.error("ensure FieldCopilot schema failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}

/** @internal test hook */
export function resetFieldCopilotSchemaCache(): void {
  ensured = false;
  ensurePromise = null;
}
