import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { readColouredDoorways } from "@/lib/projects/floorplan-colour-openings";
import { lockScaleToHint } from "@/lib/projects/floorplan-scale";
import { readSheetScale } from "@/lib/projects/floorplan-sheet-scale";
import { rasterizePdfPageJpeg } from "@/lib/projects/floorplan-raster-page";
import { flatExtentFromSheet } from "@/lib/projects/floorplan-render-flat";
import {
  extractFloorplanVectorGeometry,
  extractPdfPageText,
  extractPrintedAreas,
  wallBoundingBox,
} from "@/lib/projects/floorplan-vector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * What the pipeline can read off a sheet, without drawing anything.
 *
 * Whether a plan takes the measured route is decided by half a dozen steps
 * that each answer "no" the same way, and until now the only way to ask which
 * one gave up was to run a whole visualisation — six image calls and four
 * minutes — and read the result. 28-8-23-2 reads as a clean vector drawing on
 * a laptop and as no vector drawing at all on the platform, and this is what
 * tells us which step differs there.
 *
 * Reads only: no model is called and nothing is stored.
 */
export const POST = withWorkspacesAuth(async (req, { orgId, role }) => {
  try {
    const limited = await applyRateLimit(req, "floorplan-viz:inspect", 20, 60_000);
    if (limited) return limited;

    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonBadRequest("חסר קובץ תוכנית", "missing_fields");
    if (file.size > MAX_BYTES) return jsonBadRequest("הקובץ גדול מדי (מקסימום 4MB)", "file_too_large");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return jsonBadRequest("הבדיקה הזו קוראת PDF וקטורי בלבד", "not_pdf");
    }

    const report: Record<string, unknown> = { bytes: bytes.length };

    // The two packages every read depends on. They are external and loaded
    // through a dynamic import, which is exactly how they went missing from
    // the deployed function without a single error reaching the result.
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      report.pdfjs = typeof pdfjs.getDocument === "function" ? "ok" : "loaded, no getDocument";
    } catch (err: unknown) {
      report.pdfjs = `missing: ${err instanceof Error ? err.message : String(err)}`;
    }
    try {
      const canvas = await import("@napi-rs/canvas");
      report.canvas = typeof canvas.createCanvas === "function" ? "ok" : "loaded, no createCanvas";
    } catch (err: unknown) {
      report.canvas = `missing: ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
      const geometry = await extractFloorplanVectorGeometry(bytes);
      report.geometry = geometry
        ? {
            pageWidth: Math.round(geometry.pageWidth),
            pageHeight: Math.round(geometry.pageHeight),
            segments: geometry.segments.length,
            curves: geometry.curves.length,
            walls: geometry.walls.length,
            wallBox: wallBoundingBox(geometry),
          }
        : null;
    } catch (err: unknown) {
      report.geometryError = err instanceof Error ? err.message : String(err);
    }

    try {
      report.extent = await flatExtentFromSheet(bytes);
    } catch (err: unknown) {
      report.extentError = err instanceof Error ? err.message : String(err);
    }

    try {
      report.printedAreas = (await extractPrintedAreas(bytes)).map((a) => a.value);
      report.textLength = (await extractPdfPageText(bytes)).trim().length;
    } catch (err: unknown) {
      report.textError = err instanceof Error ? err.message : String(err);
    }

    try {
      const jpeg = await rasterizePdfPageJpeg(bytes, 900);
      report.raster = jpeg ? { bytes: Math.round((jpeg.length * 3) / 4) } : null;
    } catch (err: unknown) {
      report.rasterError = err instanceof Error ? err.message : String(err);
    }

    try {
      const geometry = await extractFloorplanVectorGeometry(bytes);
      const doorways = geometry
        ? await readColouredDoorways(bytes, { width: geometry.pageWidth }, 28)
        : [];
      report.colouredDoorways = doorways.length;
    } catch (err: unknown) {
      report.doorwayError = err instanceof Error ? err.message : String(err);
    }

    // One vision call, only when asked for: this is the figure the measured
    // route locks its scale against, and reading it is the difference between
    // tuning the lock and re-rendering the flat to find out what it chose.
    if (String(form.get("scale") ?? "").trim() === "1") {
      try {
        const extent = report.extent as { width: number; height: number } | null;
        if (extent) {
          const reading = await readSheetScale(bytes.toString("base64"), "application/pdf", extent);
          report.scaleReading = reading;
          if (reading) {
            const geometry = await extractFloorplanVectorGeometry(bytes);
            const lock =
              geometry && report.extent
                ? lockScaleToHint(
                    geometry.segments,
                    report.extent as { x: number; y: number; width: number; height: number },
                    reading.unitsPerMetre,
                    geometry.curves,
                  )
                : null;
            report.scaleLock = lock
              ? { unitsPerMetre: lock.unitsPerMetre, beds: lock.beds, floorM2: Math.round(lock.floorM2) }
              : null;
          }
        }
      } catch (err: unknown) {
        report.scaleError = err instanceof Error ? err.message : String(err);
      }
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    return apiErrorResponse(error, "visualize-floorplan-inspect");
  }
});
