import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonServiceUnavailable } from "@/lib/api-json";
import { issueAsset } from "@/lib/knowledge-vault/service";
import { isKnowledgeVaultEnabled } from "@/lib/knowledge-vault/platform";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().default("application/pdf"),
  contentBase64: z.string().min(1),
  issuedByWidget: z.string().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId, userId }, data) => {
    if (!(await isKnowledgeVaultEnabled())) {
      return jsonServiceUnavailable("מאגר ידע מושבת בהגדרות הפלטפורמה.", "knowledge_vault_disabled");
    }

    try {
      const buffer = Buffer.from(data.contentBase64, "base64");
      const result = await issueAsset(userId, orgId, {
        fileName: data.fileName,
        mimeType: data.mimeType,
        content: buffer,
        issuedByWidget: data.issuedByWidget,
      });
      return NextResponse.json({
        ok: true,
        driveFileId: result.driveFileId,
        entryId: result.entry.id,
      });
    } catch (error) {
      return googleDriveErrorResponse(error);
    }
  },
  { schema: bodySchema, rateLimit: { key: "kv:issue", limit: 10, windowMs: 60_000 } },
);
