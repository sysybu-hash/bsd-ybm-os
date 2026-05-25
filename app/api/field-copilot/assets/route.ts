import { NextResponse, type NextRequest } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { jsonBadRequest } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { isFieldCopilotEnabled } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { archiveFieldCopilotAsset } from "@/lib/field-copilot/archive-to-drive";
import { fieldCopilotAssetUploadSchema } from "@/lib/validation/schemas/field-copilot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const log = createLogger("api/field-copilot/assets");

export const POST = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "field-copilot:assets", 30, 60_000);
  if (limited) return limited;

  const blocked = await guardConstructionOnlyApi(orgId);
  if (blocked) return blocked;

  if (!(await isFieldCopilotEnabled())) {
    return NextResponse.json({ error: "קופיילוט שטח מושבת" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = fieldCopilotAssetUploadSchema.safeParse(body);
  if (!parsed.success) return jsonBadRequest("קובץ לא תקין", "invalid_asset");

  const session = await prisma.fieldCopilotSession.findFirst({
    where: { id: parsed.data.sessionId, organizationId: orgId, userId },
  });
  if (!session) return NextResponse.json({ error: "סשן לא נמצא" }, { status: 404 });

  const photoCount = await prisma.fieldCopilotAsset.count({
    where: { sessionId: session.id, kind: "photo" },
  });
  if (parsed.data.kind === "photo" && photoCount >= 8) {
    return jsonBadRequest("מקסימום 8 תמונות", "photo_limit");
  }

  try {
    const asset = await prisma.fieldCopilotAsset.create({
      data: {
        sessionId: session.id,
        organizationId: orgId,
        mimeType: parsed.data.mimeType,
        kind: parsed.data.kind,
        dataBase64: parsed.data.dataBase64,
      },
    });

    if (parsed.data.kind === "video") {
      await prisma.fieldCopilotSession.update({
        where: { id: session.id },
        data: { videoAssetId: asset.id },
      });
    }

    let driveSaved = false;
    let driveWarning: string | undefined;
    if (!session.projectId) {
      driveWarning = "no_project";
    } else if (parsed.data.kind === "photo" || parsed.data.kind === "video") {
      const buffer = Buffer.from(parsed.data.dataBase64, "base64");
      const archive = await archiveFieldCopilotAsset({
        userId,
        organizationId: orgId,
        session: { id: session.id, projectId: session.projectId },
        asset: {
          id: asset.id,
          kind: asset.kind,
          mimeType: asset.mimeType,
          createdAt: asset.createdAt,
        },
        buffer,
      });
      driveSaved = archive.ok;
      if (!archive.ok) driveWarning = archive.reason;
    }

    return NextResponse.json({
      asset: { id: asset.id, kind: asset.kind, mimeType: asset.mimeType },
      driveSaved,
      driveWarning,
    });
  } catch (err: unknown) {
    log.error("asset upload failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "שגיאה בהעלאה" }, { status: 500 });
  }
});
