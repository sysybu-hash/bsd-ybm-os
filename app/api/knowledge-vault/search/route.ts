import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { isKnowledgeVaultEnabled } from "@/lib/knowledge-vault/platform";
import { searchKnowledgeVaultChunks } from "@/lib/knowledge-vault/chunk-index";
import { jsonServiceUnavailable } from "@/lib/api-json";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  if (!(await isKnowledgeVaultEnabled())) {
    return jsonServiceUnavailable("מאגר ידע מושבת בהגדרות הפלטפורמה.", "knowledge_vault_disabled");
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "שאילתה לא תקינה" }, { status: 400 });
  }

  const hits = await searchKnowledgeVaultChunks(orgId, parsed.data.q, parsed.data.limit ?? 12);
  return NextResponse.json({ ok: true, hits });
}, { rateLimit: { key: "kv:search", limit: 60, windowMs: 60_000 } });
