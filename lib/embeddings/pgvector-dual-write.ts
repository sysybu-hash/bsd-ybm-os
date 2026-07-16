import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("embeddings/pgvector");

/** Gemini text-embedding-004 dimension */
export const EMBEDDING_VECTOR_DIM = 768;

let pgVectorAvailable: boolean | null = null;

export function isPgVectorEnabled(): boolean {
  return env.USE_PGVECTOR === true;
}

function vectorLiteral(values: number[]): string {
  const parts = values.map((v) => (Number.isFinite(v) ? v : 0));
  return `[${parts.join(",")}]`;
}

async function probePgVectorColumn(table: "KnowledgeVaultChunk" | "ContactSearchEmbedding"): Promise<boolean> {
  try {
    const col =
      table === "KnowledgeVaultChunk" ? "embeddingVector" : "embeddingVector";
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${col}
      ) AS "exists"
    `;
    return rows[0]?.exists === true;
  } catch {
    return false;
  }
}

/** True when USE_PGVECTOR=true and migration columns exist. */
export async function canUsePgVectorStorage(): Promise<boolean> {
  if (!isPgVectorEnabled()) return false;
  if (pgVectorAvailable === true) return true;
  if (pgVectorAvailable === false) return false;

  const kv = await probePgVectorColumn("KnowledgeVaultChunk");
  const contact = await probePgVectorColumn("ContactSearchEmbedding");
  pgVectorAvailable = kv && contact;
  if (!pgVectorAvailable) {
    log.warn("USE_PGVECTOR=true but embeddingVector columns missing — JSON fallback only");
  }
  return pgVectorAvailable;
}

export async function writeKnowledgeVaultChunkEmbedding(
  chunkId: string,
  embedding: number[] | null,
): Promise<void> {
  if (!embedding?.length) return;
  if (!(await canUsePgVectorStorage())) return;
  if (embedding.length !== EMBEDDING_VECTOR_DIM) {
    log.warn("embedding_dim_mismatch", { expected: EMBEDDING_VECTOR_DIM, got: embedding.length });
    return;
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgeVaultChunk" SET "embeddingVector" = $1::vector WHERE "id" = $2`,
      vectorLiteral(embedding),
      chunkId,
    );
  } catch (err: unknown) {
    log.warn("pgvector_kv_write_failed", {
      chunkId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function writeContactSearchEmbeddingVector(
  rowId: string,
  embedding: number[],
): Promise<void> {
  if (!(await canUsePgVectorStorage())) return;
  if (embedding.length !== EMBEDDING_VECTOR_DIM) return;

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "ContactSearchEmbedding" SET "embeddingVector" = $1::vector WHERE "id" = $2`,
      vectorLiteral(embedding),
      rowId,
    );
  } catch (err: unknown) {
    log.warn("pgvector_contact_write_failed", {
      rowId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export type PgVectorChunkHit = {
  driveEntryId: string;
  driveFileId: string;
  name: string;
  chunkIndex: number;
  snippet: string;
  score: number;
};

/**
 * ANN search via pgvector cosine distance. Returns null when unavailable (caller uses JSON fallback).
 */
export async function searchKnowledgeVaultChunksPgvector(
  organizationId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<PgVectorChunkHit[] | null> {
  if (!(await canUsePgVectorStorage())) return null;
  if (queryEmbedding.length !== EMBEDDING_VECTOR_DIM) return null;

  try {
    const lit = vectorLiteral(queryEmbedding);
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        driveEntryId: string;
        driveFileId: string;
        name: string;
        chunkIndex: number;
        content: string;
        distance: number;
      }>
    >(
      `SELECT c."driveEntryId",
              d."driveFileId",
              d."name",
              c."chunkIndex",
              c."content",
              (c."embeddingVector" <=> $1::vector) AS distance
       FROM "KnowledgeVaultChunk" c
       INNER JOIN "DriveEntry" d ON d."id" = c."driveEntryId"
       WHERE c."organizationId" = $2
         AND c."embeddingVector" IS NOT NULL
       ORDER BY c."embeddingVector" <=> $1::vector
       LIMIT $3`,
      lit,
      organizationId,
      limit,
    );

    return rows.map((r) => ({
      driveEntryId: r.driveEntryId,
      driveFileId: r.driveFileId,
      name: r.name,
      chunkIndex: r.chunkIndex,
      snippet: (r.content ?? "").slice(0, 280),
      // cosine distance → similarity-ish (1 - distance) for <=> on vector_cosine_ops
      score: Math.max(0, 1 - Number(r.distance)),
    }));
  } catch (err: unknown) {
    log.warn("pgvector_kv_search_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Reset probe cache (tests). */
export function resetPgVectorProbeCache(): void {
  pgVectorAvailable = null;
}
