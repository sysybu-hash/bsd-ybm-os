import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { embedText, cosineSimilarity, isEmbeddingConfigured } from "@/lib/embeddings/gemini-embed";

function contactSearchText(c: {
  name: string;
  email: string | null;
  notes: string | null;
  status: string;
  tags: string[];
}): string {
  return [c.name, c.email, c.notes, c.status, c.tags.join(" ")].filter(Boolean).join("\n");
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function syncContactEmbeddingsForOrg(organizationId: string): Promise<number> {
  if (!isEmbeddingConfigured()) return 0;

  const contacts = await prisma.contact.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, notes: true, status: true, tags: true },
    take: 500,
  });

  let updated = 0;
  for (const c of contacts) {
    const text = contactSearchText(c);
    const textHash = hashText(text);
    const existing = await prisma.contactSearchEmbedding.findUnique({
      where: { contactId: c.id },
      select: { textHash: true },
    });
    if (existing?.textHash === textHash) continue;

    const embedding = await embedText(text);
    if (!embedding) continue;

    await prisma.contactSearchEmbedding.upsert({
      where: { contactId: c.id },
      create: {
        organizationId,
        contactId: c.id,
        textHash,
        embedding,
      },
      update: { textHash, embedding },
    });
    updated++;
  }
  return updated;
}

export async function searchContactsByEmbedding(
  organizationId: string,
  query: string,
  limit = 25,
): Promise<string[]> {
  const queryVec = await embedText(query);
  if (!queryVec) return [];

  const rows = await prisma.contactSearchEmbedding.findMany({
    where: { organizationId },
    select: { contactId: true, embedding: true },
    take: 500,
  });

  const scored = rows
    .map((r) => {
      const vec = Array.isArray(r.embedding) ? (r.embedding as number[]) : [];
      return { id: r.contactId, score: cosineSimilarity(queryVec, vec) };
    })
    .filter((x) => x.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.id);
}
