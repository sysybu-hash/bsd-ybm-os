import { NextResponse, type NextRequest } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { jsonBadRequest } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { isFieldCopilotEnabled } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { getMessages } from "@/lib/i18n/load-messages";
import { normalizeLocale } from "@/lib/i18n/config";
import { fieldCopilotAnalyzeSchema } from "@/lib/validation/schemas/field-copilot";
import { analyzeFieldCapture } from "@/lib/field-copilot/analyze";
import { v5ToPersistableAiData } from "@/lib/scan-schema-v5";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const log = createLogger("api/field-copilot/analyze");

function localeLang(locale: string): string {
  const loc = normalizeLocale(locale);
  if (loc === "en") return "English";
  if (loc === "ru") return "Russian";
  return "Hebrew";
}

export const POST = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "field-copilot:analyze", 10, 60_000);
  if (limited) return limited;

  const blocked = await guardConstructionOnlyApi(orgId);
  if (blocked) return blocked;

  if (!(await isFieldCopilotEnabled())) {
    return NextResponse.json({ error: "קופיילוט שטח מושבת" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = fieldCopilotAnalyzeSchema.safeParse(body);
  if (!parsed.success) return jsonBadRequest("בקשה לא תקינה", "invalid_body");

  const session = await prisma.fieldCopilotSession.findFirst({
    where: { id: parsed.data.sessionId, organizationId: orgId, userId },
    include: { assets: true },
  });
  if (!session) return NextResponse.json({ error: "סשן לא נמצא" }, { status: 404 });

  await prisma.fieldCopilotSession.update({
    where: { id: session.id },
    data: { status: "ANALYZING" },
  });

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { industry: true, constructionTrade: true },
  });

  const locale = parsed.data.locale ?? "he";
  const messages = getMessages(locale);

  const imageAssets = session.assets.filter(
    (a) => a.kind === "photo" || a.kind === "keyframe",
  );

  try {
    const result = await analyzeFieldCapture({
      locale,
      localeLang: localeLang(locale),
      industry: org?.industry ?? "CONSTRUCTION",
      trade: session.constructionTrade ?? org?.constructionTrade ?? null,
      messages,
      transcript: session.transcript,
      userNotes: session.userNotes,
      projectName: session.projectName,
      clientName: session.contactName,
      images: imageAssets.map((a) => ({
        base64: a.dataBase64,
        mimeType: a.mimeType,
      })),
    });

    const analysisJson = v5ToPersistableAiData(result.extraction);

    const updated = await prisma.fieldCopilotSession.update({
      where: { id: session.id },
      data: {
        analysisJson: analysisJson as object,
        assumptionsJson: result.assumptions,
        scopeSummary: result.scopeSummary,
        status: "READY",
      },
      include: { assets: true },
    });

    return NextResponse.json({
      extraction: result.extraction,
      assumptions: result.assumptions,
      scopeSummary: result.scopeSummary,
      sessionId: updated.id,
    });
  } catch (err: unknown) {
    await prisma.fieldCopilotSession.update({
      where: { id: session.id },
      data: { status: "DRAFT" },
    });
    log.error("analyze failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ניתוח נכשל" },
      { status: 502 },
    );
  }
});
