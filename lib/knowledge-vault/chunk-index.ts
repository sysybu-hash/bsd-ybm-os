import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { embedText, cosineSimilarity, isEmbeddingConfigured } from "@/lib/embeddings/gemini-embed";

const CHUNK_SIZE = 1200;

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function chunkPlainText(text: string, size = CHUNK_SIZE): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let i = 0; i < normalized.length; i += size) {
    chunks.push(normalized.slice(i, i + size));
  }
  return chunks;
}

export function summaryToSearchText(summary: unknown, fileName?: string): string {
  const parts: string[] = [];
  if (fileName?.trim()) parts.push(fileName.trim());
  if (summary && typeof summary === "object") {
    const s = summary as Record<string, unknown>;
    for (const key of ["textPreview", "detectedDocType", "detectedClientName"]) {
      const v = s[key];
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
    }
  }
  return parts.join("\n");
}

export async function indexKnowledgeVaultEntry(
  organizationId: string,
  driveEntryId: string,
  summary: unknown,
  fileName?: string,
): Promise<number> {
  const text = summaryToSearchText(summary, fileName);
  const chunks = chunkPlainText(text);
  if (chunks.length === 0) {
    await prisma.knowledgeVaultChunk.deleteMany({ where: { driveEntryId } });
    return 0;
  }

  const embeddingsEnabled = isEmbeddingConfigured();
  let written = 0;

  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i]!;
    const textHash = hashText(content);
    const existing = await prisma.knowledgeVaultChunk.findUnique({
      where: { driveEntryId_chunkIndex: { driveEntryId, chunkIndex: i } },
      select: { textHash: true },
    });
    if (existing?.textHash === textHash) continue;

    const embedding = embeddingsEnabled ? await embedText(content) : null;
    await prisma.knowledgeVaultChunk.upsert({
      where: { driveEntryId_chunkIndex: { driveEntryId, chunkIndex: i } },
      create: {
        organizationId,
        driveEntryId,
        chunkIndex: i,
        content,
        textHash,
        embedding: embedding ?? undefined,
      },
      update: {
        content,
        textHash,
        embedding: embedding ?? undefined,
      },
    });
    written++;
  }

  await prisma.knowledgeVaultChunk.deleteMany({
    where: { driveEntryId, chunkIndex: { gte: chunks.length } },
  });

  return written;
}

export type VaultChunkHit = {
  driveEntryId: string;
  driveFileId: string;
  name: string;
  chunkIndex: number;
  snippet: string;
  score: number;
};

export async function searchKnowledgeVaultChunks(
  organizationId: string,
  query: string,
  limit = 12,
): Promise<VaultChunkHit[]> {
  const q = query.trim();
  if (!q) return [];

  const rows = await prisma.knowledgeVaultChunk.findMany({
    where: { organizationId },
    select: {
      chunkIndex: true,
      content: true,
      embedding: true,
      driveEntry: { select: { id: true, driveFileId: true, name: true } },
    },
    take: 800,
  });

  type ChunkRow = (typeof rows)[number];

  if (!isEmbeddingConfigured()) {
    const lower = q.toLowerCase();
    return rows
      .filter((r: ChunkRow) => r.content.toLowerCase().includes(lower))
      .slice(0, limit)
      .map((r: ChunkRow): VaultChunkHit => ({
        driveEntryId: r.driveEntry.id,
        driveFileId: r.driveEntry.driveFileId,
        name: r.driveEntry.name,
        chunkIndex: r.chunkIndex,
        snippet: r.content.slice(0, 280),
        score: 1,
      }));
  }

  const queryVec = await embedText(q);
  if (!queryVec) return [];

  return rows
    .map((r: ChunkRow): VaultChunkHit => {
      const vec = Array.isArray(r.embedding) ? (r.embedding as number[]) : [];
      return {
        driveEntryId: r.driveEntry.id,
        driveFileId: r.driveEntry.driveFileId,
        name: r.driveEntry.name,
        chunkIndex: r.chunkIndex,
        snippet: r.content.slice(0, 280),
        score: cosineSimilarity(queryVec, vec),
      };
    })
    .filter((x: VaultChunkHit) => x.score > 0.32)
    .sort((a: VaultChunkHit, b: VaultChunkHit) => b.score - a.score)
    .slice(0, limit);
}
