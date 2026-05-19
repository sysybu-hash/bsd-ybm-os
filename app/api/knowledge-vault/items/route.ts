import { NextResponse } from "next/server";
import { KnowledgeVaultPath } from "@prisma/client";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonServiceUnavailable } from "@/lib/api-json";
import { listForOrg } from "@/lib/knowledge-vault/service";
import { isKnowledgeVaultEnabled } from "@/lib/knowledge-vault/platform";

export const dynamic = "force-dynamic";

const PATH_VALUES = new Set<string>(["INGEST", "PARSED", "ISSUED", "ARCHIVE"]);

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  if (!(await isKnowledgeVaultEnabled())) {
    return jsonServiceUnavailable("מאגר ידע מושבת בהגדרות הפלטפורמה.", "knowledge_vault_disabled");
  }

  const { searchParams } = new URL(req.url);
  const vaultPathRaw = searchParams.get("vaultPath");
  const search = searchParams.get("search") ?? undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  const vaultPath =
    vaultPathRaw && PATH_VALUES.has(vaultPathRaw)
      ? (vaultPathRaw as KnowledgeVaultPath)
      : undefined;

  const items = await listForOrg(orgId, { vaultPath, search, limit });
  return NextResponse.json({ ok: true, items });
});
