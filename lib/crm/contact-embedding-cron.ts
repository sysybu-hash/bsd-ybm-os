import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { isEmbeddingConfigured } from "@/lib/embeddings/gemini-embed";
import { syncContactEmbeddingsForOrg } from "@/lib/crm/contact-embedding-index";

const log = createLogger("contact-embedding-cron");

export async function runContactEmbeddingsCron(): Promise<{
  organizations: number;
  embeddingsUpdated: number;
  skipped: boolean;
}> {
  if (!isEmbeddingConfigured()) {
    log.warn("contact_embeddings_skipped", { reason: "embedding_not_configured" });
    return { organizations: 0, embeddingsUpdated: 0, skipped: true };
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let embeddingsUpdated = 0;

  for (const { id } of orgs) {
    try {
      embeddingsUpdated += await syncContactEmbeddingsForOrg(id);
    } catch (err: unknown) {
      log.error("contact_embeddings_org_failed", {
        organizationId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { organizations: orgs.length, embeddingsUpdated, skipped: false };
}
