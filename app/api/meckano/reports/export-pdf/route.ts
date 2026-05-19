import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { renderHtmlPdfChromium } from "@/lib/pdf/render-html-pdf-chromium";
import { buildMeckanoReportHtml } from "@/lib/pdf/meckano-report-html";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/meckano/pdf");

const exportSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  rows: z.array(
    z.object({
      date: z.string(),
      employeeName: z.string(),
      project: z.string(),
      location: z.string(),
      hours: z.number(),
    }),
  ),
});

/**
 * POST /api/meckano/reports/export-pdf
 * body: { startDate, endDate, rows[] }
 *  → application/pdf (Chromium-rendered, RTL/Hebrew supported)
 *
 * הסיבה ש-rows מגיע מהלקוח: ה-widget כבר חישב אותם דרך /api/meckano/reports
 * ואין סיבה לחשב פעמיים. כל הרשומות ב-payload נשמרות בזיכרון בלבד (אין persist).
 */
export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    const html = buildMeckanoReportHtml({
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      organizationName: org?.name ?? undefined,
      rows: parsed.data.rows,
    });

    const pdf = await renderHtmlPdfChromium(html, { orientation: "landscape" });
    const filename = `meckano_report_${parsed.data.startDate}_${parsed.data.endDate}.pdf`;
    return new NextResponse(new Blob([pdf as BlobPart], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    log.error("meckano pdf render failed", err);
    const msg = err instanceof Error ? err.message : "PDF render failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
