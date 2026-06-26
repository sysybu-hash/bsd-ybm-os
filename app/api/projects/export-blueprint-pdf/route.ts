import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { renderHtmlPdfChromium } from "@/lib/pdf/render-html-pdf-chromium";
import { buildBlueprintPdfHtml } from "@/lib/projects/blueprint-pdf-html";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(async (req) => {
  const limited = await applyRateLimit(req, "blueprint:export-pdf", 10, 60_000);
  if (limited) return limited;

  const { analysis, projectName } = (await req.json()) as { analysis: BlueprintAnalysis; projectName?: string };
  const html = buildBlueprintPdfHtml(analysis, projectName);
  const buffer = await renderHtmlPdfChromium(html);
  const safeName = `blueprint-${(projectName ?? "export").replace(/[^\wא-ת._-]/g, "_")}.pdf`;

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    },
  });
});
