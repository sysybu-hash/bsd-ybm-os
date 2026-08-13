import { prisma } from "@/lib/prisma";
import { embedText, isEmbeddingConfigured } from "@/lib/embeddings/gemini-embed";
import {
  writeContactSearchEmbeddingVector,
  writeKnowledgeVaultChunkEmbedding,
} from "@/lib/embeddings/pgvector-dual-write";
import { createLogger } from "@/lib/logger";

const log = createLogger("embeddings/reembed-all");

export type ReembedAllResult = {
  chunksUpdated: number;
  chunksFailed: number;
  contactsUpdated: number;
  contactsFailed: number;
  chunksTotal: number;
  contactsTotal: number;
};

const DEFAULT_BATCH = 25;

function contactSearchText(c: {
  name: string;
  email: string | null;
  notes: string | null;
  status: string;
  tags: string[];
}): string {
  return [c.name, c.email, c.notes, c.status, c.tags.join(" ")].filter(Boolean).join("\n");
}

export async function reembedAllVectors(options?: {
  organizationId?: string;
  batchSize?: number;
  maxChunks?: number;
  maxContacts?: number;
  onProgress?: (done: number, total: number, kind: "chunk" | "contact") => void;
}): Promise<ReembedAllResult> {
  if (!isEmbeddingConfigured()) {
    throw new Error("embeddings_not_configured");
  }

  const organizationId = options?.organizationId;
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const orgFilter = organizationId ? { organizationId } : {};

  const chunksTotal = await prisma.knowledgeVaultChunk.count({
    where: { ...orgFilter, NOT: { content: "" } },
  });
  const contactsTotal = await prisma.contactSearchEmbedding.count({
    where: orgFilter,
  });

  let chunksUpdated = 0;
  let chunksFailed = 0;
  let chunkCursor: string | undefined;

  for (;;) {
    const batch = await prisma.knowledgeVaultChunk.findMany({
      where: { ...orgFilter, NOT: { content: "" } },
      select: { id: true, content: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(chunkCursor ? { skip: 1, cursor: { id: chunkCursor } } : {}),
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const vec = await embedText(row.content);
      if (!vec) {
        chunksFailed++;
      } else {
        await prisma.knowledgeVaultChunk.update({
          where: { id: row.id },
          data: { embedding: vec },
        });
        await writeKnowledgeVaultChunkEmbedding(row.id, vec);
        chunksUpdated++;
      }
      if (options?.maxChunks != null && chunksUpdated + chunksFailed >= options.maxChunks) break;
    }
    chunkCursor = batch[batch.length - 1]?.id;
    options?.onProgress?.(chunksUpdated + chunksFailed, chunksTotal, "chunk");
    if (batch.length < batchSize) break;
    if (options?.maxChunks != null && chunksUpdated + chunksFailed >= options.maxChunks) break;
  }

  let contactsUpdated = 0;
  let contactsFailed = 0;
  let contactCursor: string | undefined;

  for (;;) {
    const batch = await prisma.contactSearchEmbedding.findMany({
      where: orgFilter,
      select: { id: true, contactId: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(contactCursor ? { skip: 1, cursor: { id: contactCursor } } : {}),
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const source = await prisma.contact.findUnique({
        where: { id: row.contactId },
        select: { name: true, email: true, notes: true, status: true, tags: true },
      });
      if (!source) {
        contactsFailed++;
      } else {
        const vec = await embedText(contactSearchText(source));
        if (!vec) {
          contactsFailed++;
        } else {
          await prisma.contactSearchEmbedding.update({
            where: { id: row.id },
            data: { embedding: vec },
          });
          await writeContactSearchEmbeddingVector(row.id, vec);
          contactsUpdated++;
        }
      }
      if (options?.maxContacts != null && contactsUpdated + contactsFailed >= options.maxContacts) break;
    }
    contactCursor = batch[batch.length - 1]?.id;
    options?.onProgress?.(contactsUpdated + contactsFailed, contactsTotal, "contact");
    if (batch.length < batchSize) break;
    if (options?.maxContacts != null && contactsUpdated + contactsFailed >= options.maxContacts) break;
  }

  log.info("reembed_all_done", {
    chunksUpdated,
    chunksFailed,
    contactsUpdated,
    contactsFailed,
    chunksTotal,
    contactsTotal,
  });

  return {
    chunksUpdated,
    chunksFailed,
    contactsUpdated,
    contactsFailed,
    chunksTotal,
    contactsTotal,
  };
}
