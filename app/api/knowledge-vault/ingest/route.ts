import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonServiceUnavailable } from "@/lib/api-json";
import { ingestFromUpload } from "@/lib/knowledge-vault/service";
import { isKnowledgeVaultEnabled } from "@/lib/knowledge-vault/platform";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";

export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  if (!(await isKnowledgeVaultEnabled())) {
    return jsonServiceUnavailable("מאגר ידע מושבת בהגדרות הפלטפורמה.", "knowledge_vault_disabled");
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const sourceWidgetId = form.get("sourceWidgetId");
    const autoParse = form.get("autoParse");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
    }

    const result = await ingestFromUpload(userId, orgId, file, {
      sourceWidgetId: typeof sourceWidgetId === "string" ? sourceWidgetId : undefined,
      autoParse: autoParse !== "false",
    });

    return NextResponse.json({
      ok: true,
      driveFileId: result.driveFileId,
      webViewLink: result.webViewLink,
      entryId: result.entry.id,
    });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});
