import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { getMessages } from "@/lib/i18n/load-messages";
import { normalizeLocale } from "@/lib/i18n/config";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { unifiedExtractFromFile } from "@/lib/scan/unified-extract";
import { mapLegacyAnalysisTypeToScanMode } from "@/lib/scan/unified-extract";
import { unifiedSaveScan } from "@/lib/scan/unified-save";
import { inferScreenTypeFromFileForIndustry } from "@/lib/ai/screen-decode-policy";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";

export const POST = withWorkspacesAuth(async (request, { orgId, userId }) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { industry: true, constructionTrade: true },
    });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return jsonBadRequest("No file uploaded", "missing_file");
    }

    const industry = org?.industry ?? "CONSTRUCTION";
    const analysisType = (formData.get("analysisType") as string | null) ?? "INVOICE";
    const scanModeRaw = formData.get("scanMode") as string | null;
    const scanMode: ScanModeV5 =
      scanModeRaw && scanModeRaw.length > 0
        ? (scanModeRaw as ScanModeV5)
        : mapLegacyAnalysisTypeToScanMode(analysisType);

    const persist = formData.get("persist") === "true";

    const extraction = await unifiedExtractFromFile({
      file,
      userId,
      scanMode,
      industry,
      engineRunMode: "AUTO",
    });

    const { v5, aiData } = extraction;

    let documentId: string | undefined;
    if (persist) {
      const saved = await unifiedSaveScan(
        {
          file,
          fileName: file.name,
          v5,
          aiData,
          target: "expense",
          userId,
          organizationId: orgId,
        },
        { userId, organizationId: orgId, industry },
      );
      if (!saved.ok) {
        return NextResponse.json({ success: false, error: saved.error }, { status: 500 });
      }
      documentId = saved.documentId;
    }

    const cookieJar = await cookies();
    const locale = normalizeLocale(cookieJar.get("bsd-locale")?.value);
    const messages = getMessages(locale);
    void messages;
    void inferScreenTypeFromFileForIndustry;

    return NextResponse.json({
      success: true,
      analysis: {
        amount: v5.total,
        vendor: v5.vendor,
        taxId: v5.taxId,
        projectSuggestion: v5.documentMetadata?.project || "פרויקט כללי",
        confidence: v5.confidenceScore ?? 0.95,
        summary: v5.summary,
        documentId,
      },
      v5,
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "Analysis/Persist Error");
  }
});
