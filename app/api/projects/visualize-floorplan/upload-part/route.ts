import { NextResponse } from "next/server";

import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import {
  beginPlanUpload,
  isPlanUploadId,
  planUploadReady,
  putPlanUploadPart,
} from "@/lib/projects/floorplan-plan-upload";
import { PLAN_UPLOAD_MAX_BYTES } from "@/lib/projects/plan-upload-limits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A plan that does not fit in one request, when Blob is not configured.
 *
 * The browser sends the drawing in pieces. The run reads them back by id.
 * One drawing can be a couple of hundred pieces, so this route has its own
 * limit instead of the shared workspace cap.
 */
export const POST = withWorkspacesAuth(
  async (req, { orgId, role }) => {
    try {
      const block = await guardConstructionOnlyApi(orgId, role);
      if (block) return block;

      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        const uploadId = String(form.get("uploadId") ?? "").trim();
        const index = Number(String(form.get("index") ?? ""));
        const entry = form.get("file");
        if (
          !isPlanUploadId(uploadId) ||
          !entry ||
          typeof entry === "string" ||
          typeof entry.arrayBuffer !== "function"
        ) {
          return jsonBadRequest("חסר חלק מהקובץ", "missing_fields");
        }
        const ok = await putPlanUploadPart({
          orgId,
          uploadId,
          index,
          bytes: Buffer.from(await entry.arrayBuffer()),
        });
        if (!ok) return jsonBadRequest("חלק הקובץ לא התקבל", "upload_part_rejected");
        return NextResponse.json({ success: true });
      }

      const body = (await req.json().catch(() => null)) as {
        op?: unknown;
        fileName?: unknown;
        totalBytes?: unknown;
        totalParts?: unknown;
        uploadId?: unknown;
      } | null;
      const op = typeof body?.op === "string" ? body.op : "";
      if (op === "begin") {
        const totalBytes = Number(body?.totalBytes);
        if (Number.isInteger(totalBytes) && totalBytes > PLAN_UPLOAD_MAX_BYTES) {
          return jsonBadRequest("הקובץ גדול מדי", "upload_too_large");
        }
        const uploadId = await beginPlanUpload({
          orgId,
          fileName: typeof body?.fileName === "string" ? body.fileName : "plan",
          totalBytes,
          totalParts: Number(body?.totalParts),
        });
        if (!uploadId) return jsonBadRequest("לא ניתן לפתוח העלאה לקובץ הזה", "upload_unavailable");
        return NextResponse.json({ uploadId });
      }
      if (op === "finish") {
        const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : "";
        const ready = await planUploadReady(orgId, uploadId);
        if (!ready) return jsonBadRequest("העלאת הקובץ לא הושלמה", "upload_incomplete");
        return NextResponse.json({ uploadId });
      }
      return jsonBadRequest("בקשת העלאה לא מוכרת", "upload_unknown");
    } catch (error) {
      return apiErrorResponse(error, "floorplan viz upload part");
    }
  },
  { rateLimit: { key: "floorplan-viz:upload-part", limit: 600, windowMs: 60_000 } },
);
