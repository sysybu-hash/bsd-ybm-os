import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { floorplanLayoutSchema, type FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import { buildFloorplanVizPdfHtml } from "@/lib/projects/floorplan-viz-pdf-html";
import { renderHtmlPdfChromium } from "@/lib/pdf/render-html-pdf-chromium";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MAX_IMAGES = 16;
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

type ImageMeta = {
  viewId?: string;
  labelHe?: string;
  roomName?: string;
};

export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  try {
    const limited = await applyRateLimit(req, "floorplan-viz:export-pdf", 8, 60_000);
    if (limited) return limited;

    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;

    const form = await req.formData();
    const layoutRaw = String(form.get("layout") ?? "");
    const projectName = String(form.get("projectName") ?? "").trim() || undefined;
    let parsedLayout: unknown;
    try {
      parsedLayout = JSON.parse(layoutRaw);
    } catch {
      return jsonBadRequest("חסר פריסת תוכנית לייצוא", "missing_fields");
    }
    const layoutParsed = floorplanLayoutSchema.safeParse(parsedLayout);
    if (!layoutParsed.success) {
      return jsonBadRequest("פריסת התוכנית אינה תקינה", "invalid_layout");
    }

    const files = form.getAll("images").filter((row): row is File => row instanceof File);
    if (files.length === 0) {
      return jsonBadRequest("אין הדמיות לייצוא", "missing_images");
    }
    if (files.length > MAX_IMAGES) {
      return jsonBadRequest("יותר מדי הדמיות לייצוא", "too_many_images");
    }

    let meta: ImageMeta[] = [];
    try {
      const rawMeta = String(form.get("imageMeta") ?? "[]");
      const parsed = JSON.parse(rawMeta) as unknown;
      meta = Array.isArray(parsed) ? (parsed as ImageMeta[]) : [];
    } catch {
      meta = [];
    }

    const images: FloorplanVizImage[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]!;
      if (file.size > MAX_IMAGE_BYTES) {
        return jsonBadRequest("תמונה גדולה מדי לייצוא", "file_too_large");
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const row = meta[i] ?? {};
      const viewId = row.viewId === "isometric" || row.viewId === "interior" ? row.viewId : "overview";
      images.push({
        viewId,
        labelHe: (row.labelHe ?? file.name ?? `הדמיה ${i + 1}`).slice(0, 120),
        roomName: row.roomName?.slice(0, 80),
        mimeType: file.type || "image/jpeg",
        base64: buf.toString("base64"),
      });
    }

    const locators: Array<{ mimeType: string; base64: string } | null> = [];
    for (let i = 0; i < images.length; i += 1) {
      const loc = form.get(`locator-${i}`);
      if (!(loc instanceof File) || loc.size > MAX_IMAGE_BYTES) {
        locators.push(null);
        continue;
      }
      const buf = Buffer.from(await loc.arrayBuffer());
      locators.push({ mimeType: loc.type || "image/jpeg", base64: buf.toString("base64") });
    }

    // The source sheet, so the booklet can open with the still, the drawing and
    // the two side by side. A PDF sheet is rasterised by the caller; anything
    // that is not an image is ignored rather than embedded as a broken figure.
    let planImage: { mimeType: string; base64: string } | null = null;
    const planFile = form.get("planImage");
    if (planFile instanceof File && planFile.size > 0 && planFile.size <= MAX_IMAGE_BYTES) {
      const buf = Buffer.from(await planFile.arrayBuffer());
      const mimeType = planFile.type || "image/jpeg";
      if (mimeType.startsWith("image/")) {
        planImage = { mimeType, base64: buf.toString("base64") };
      }
    }

    // Three pages only — the still, the sheet, the two side by side — for when
    // the comparison is the deliverable rather than a whole brochure.
    const comparisonOnly = ["1", "true", "yes"].includes(
      String(form.get("comparisonOnly") ?? "").trim().toLowerCase(),
    );
    const styleLabelHe = String(form.get("styleLabelHe") ?? "").trim() || undefined;
    const styleSummaryHe = String(form.get("styleSummaryHe") ?? "").trim() || undefined;

    const html = buildFloorplanVizPdfHtml(layoutParsed.data, images, {
      projectName,
      locators,
      styleLabelHe,
      styleSummaryHe,
      planImage,
      comparisonOnly,
    });
    const buffer = await renderHtmlPdfChromium(html, {
      margin: { top: "12mm", right: "22mm", bottom: "18mm", left: "16mm" },
      waitForImages: true,
      timeoutMs: 90_000,
      footer: "הופק על ידי מערכת BSD-YBM",
    });

    const unit = layoutParsed.data.unitLabel || layoutParsed.data.title || "apartment";
    const safeName = `BSD-YBM-viz-${unit}`.replace(/[^\wא-ת._-]/g, "_").slice(0, 80);

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.pdf`)}`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "visualize-floorplan-export-pdf");
  }
});
