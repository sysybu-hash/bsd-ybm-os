import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { fetchFloorplanBlob } from "@/lib/projects/floorplan-blob";
import { listDwfUnits, readDwfStrip } from "@/lib/projects/dwf-building";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The apartments a permit strip draws, so the person can say which to render.
 *
 * The strip was uploaded to Blob by the browser; this reads it and leaves it
 * there, since the run that follows reads it again. Nothing is stored and no
 * model is called.
 */
export const POST = withWorkspacesAuth(async (req, { orgId, role }) => {
  try {
    const limited = await applyRateLimit(req, "floorplan-viz:dwf-units", 20, 60_000);
    if (limited) return limited;

    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;

    const body = (await req.json().catch(() => null)) as { blobUrl?: unknown } | null;
    const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl.trim() : "";
    if (!blobUrl) return jsonBadRequest("חסר קובץ תוכנית", "missing_fields");

    const fetched = await fetchFloorplanBlob(blobUrl);
    if (!fetched) return jsonBadRequest("קובץ התוכנית שהועלה אינו זמין", "blob_unavailable");

    const strip = readDwfStrip(Buffer.from(fetched.base64, "base64"));
    if (!strip) return jsonBadRequest("לא ניתן לקרוא את קובץ ה-DWF שהועלה", "cad_unreadable");

    const units = listDwfUnits(strip);
    if (units.length === 0) {
      return jsonBadRequest("לא נמצאו דירות בתוכניות הקומה שבקובץ", "no_units");
    }
    return NextResponse.json({ units });
  } catch (error) {
    return apiErrorResponse(error, "floorplan viz dwf units");
  }
});
