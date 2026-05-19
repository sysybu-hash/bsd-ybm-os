import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonServiceUnavailable } from "@/lib/api-json";
import { parseAsset } from "@/lib/knowledge-vault/service";
import { isKnowledgeVaultEnabled } from "@/lib/knowledge-vault/platform";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  driveFileId: z.string().min(1),
  driveFileIds: z.array(z.string().min(1)).optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId, userId }, data) => {
    if (!(await isKnowledgeVaultEnabled())) {
      return jsonServiceUnavailable("מאגר ידע מושבת בהגדרות הפלטפורמה.", "knowledge_vault_disabled");
    }

    try {
      const ids = data.driveFileIds?.length ? data.driveFileIds : [data.driveFileId];
      const results = [];
      for (const id of ids.slice(0, 20)) {
        const entry = await parseAsset(userId, orgId, id);
        results.push(entry);
      }
      return NextResponse.json({ ok: true, items: results });
    } catch (error) {
      return googleDriveErrorResponse(error);
    }
  },
  { schema: bodySchema },
);
