import { NextResponse } from "next/server";

import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  beginPlanUpload,
  isPlanUploadId,
  putPlanUploadPart,
  readPlanUpload,
} from "@/lib/projects/floorplan-plan-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A plan that does not fit in one request, when Blob is not configured.
 *
 * The browser sends the drawing in pieces. The run reads them back by id.
 */
export const POST = withWorkspacesAuth(async (req, { orgId, role }) => {
  try {
    const limited = await applyRateLimit(req, "floorplan-viz:upload-part", 160, 60_000);
    if (limited) return limited;

    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const uploadId = String(form.get("uploadId") ?? "").trim();
      const index = Number(String(form.get("index") ?? ""));
      const file = form.get("file");
      if (!isPlanUploadId(uploadId) || !(file instanceof File)) {
        return jsonBadRequest("חסר חלק מהקובץ", "missing_fields");
      }
      const ok = await putPlanUploadPart({
        orgId,
        uploadId,
        index,
        bytes: Buffer.from(await file.arrayBuffer()),
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
      const uploadId = await beginPlanUpload({
        orgId,
        fileName: typeof body?.fileName === "string" ? body.fileName : "plan",
        totalBytes: Number(body?.totalBytes),
        totalParts: Number(body?.totalParts),
      });
      if (!uploadId) return jsonBadRequest("לא ניתן לפתוח העלאה לקובץ הזה", "upload_unavailable");
      return NextResponse.json({ uploadId });
    }
    if (op === "finish") {
      const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : "";
      const staged = await readPlanUpload(orgId, uploadId);
      if (!staged) return jsonBadRequest("העלאת הקובץ לא הושלמה", "upload_incomplete");
      return NextResponse.json({ uploadId, bytes: staged.bytes, fileName: staged.fileName });
    }
    return jsonBadRequest("בקשת העלאה לא מוכרת", "upload_unknown");
  } catch (error) {
    return apiErrorResponse(error, "floorplan viz upload part");
  }
});
