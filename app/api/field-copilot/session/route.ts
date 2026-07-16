import { NextResponse, type NextRequest } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { jsonBadRequest } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { isFieldCopilotEnabled } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import {
  createFieldCopilotSessionSchema,
  patchFieldCopilotSessionSchema,
} from "@/lib/validation/schemas/field-copilot";
import { ensureFieldCopilotSchema } from "@/lib/field-copilot/ensure-schema";
import { mapSessionToDraft } from "@/lib/field-copilot/session-mapper";
import { prismaErrorCode, prismaErrorMessage } from "@/lib/prisma-error-message";

export const dynamic = "force-dynamic";

const log = createLogger("api/field-copilot/session");

export const GET = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "field-copilot:session:get", 60, 60_000);
  if (limited) return limited;

  const blocked = await guardConstructionOnlyApi(orgId);
  if (blocked) return blocked;

  if (!(await isFieldCopilotEnabled())) {
    return NextResponse.json({ error: "קופיילוט שטח מושבת" }, { status: 403 });
  }

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (sessionId) {
    const session = await prisma.fieldCopilotSession.findFirst({
      where: { id: sessionId, organizationId: orgId, userId },
      include: { assets: true },
    });
    if (!session) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    return NextResponse.json({ draft: mapSessionToDraft(session, session.assets) });
  }

  const sessions = await prisma.fieldCopilotSession.findMany({
    where: { organizationId: orgId, userId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: { assets: { select: { id: true, kind: true, mimeType: true, createdAt: true } } },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => mapSessionToDraft(s, s.assets as Parameters<typeof mapSessionToDraft>[1])),
  });
});

export const POST = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "field-copilot:session:post", 20, 60_000);
  if (limited) return limited;

  const blocked = await guardConstructionOnlyApi(orgId);
  if (blocked) return blocked;

  if (!(await isFieldCopilotEnabled())) {
    return NextResponse.json({ error: "קופיילוט שטח מושבת" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createFieldCopilotSessionSchema.safeParse(body);
  if (!parsed.success) return jsonBadRequest("בקשה לא תקינה", "invalid_body");

  try {
    const schemaReady = await ensureFieldCopilotSchema();
    if (!schemaReady) {
      return NextResponse.json(
        {
          error: "מודול קופיילוט שטח לא זמין. הריצו npm run db:migrate או פנו לתמיכה.",
          code: "field_copilot_schema_missing",
        },
        { status: 503 },
      );
    }

    const member = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json(
        { error: "חשבון לא מקושר לארגון פעיל. התנתקו והתחברו מחדש.", code: "org_mismatch" },
        { status: 403 },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { constructionTrade: true },
    });

    const session = await prisma.fieldCopilotSession.create({
      data: {
        organizationId: orgId,
        userId,
        contactId: parsed.data.contactId,
        contactName: parsed.data.contactName,
        projectId: parsed.data.projectId,
        projectName: parsed.data.projectName,
        constructionTrade: parsed.data.constructionTrade ?? org?.constructionTrade ?? null,
      },
      include: { assets: true },
    });

    return NextResponse.json({ draft: mapSessionToDraft(session, session.assets) });
  } catch (err: unknown) {
    const message = prismaErrorMessage(err);
    const code = prismaErrorCode(err);
    log.error("create session failed", { message, code });
    const userMessage =
      code === "P2003"
        ? "חשבון לא מקושר לארגון פעיל. התנתקו והתחברו מחדש."
        : code === "P2021" || /does not exist/i.test(message)
          ? "מודול קופיילוט שטח טרם הוגדר במסד. הריצו npm run db:migrate."
          : "שגיאה ביצירת סשן";
    const { captureServerEvent } = await import("@/lib/analytics/posthog-server");
    captureServerEvent(userId, "session_create_failed", {
      code: code ?? "create_failed",
      reason: message.slice(0, 120),
    });
    return NextResponse.json(
      { error: userMessage, code: code ?? "create_failed" },
      { status: 500 },
    );
  }
});

export const PATCH = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "field-copilot:session:patch", 40, 60_000);
  if (limited) return limited;

  const blocked = await guardConstructionOnlyApi(orgId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const parsed = patchFieldCopilotSessionSchema.safeParse(body);
  if (!parsed.success) return jsonBadRequest("בקשה לא תקינה", "invalid_body");

  const existing = await prisma.fieldCopilotSession.findFirst({
    where: { id: parsed.data.sessionId, organizationId: orgId, userId },
  });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const d = parsed.data;
  try {
    const session = await prisma.fieldCopilotSession.update({
      where: { id: existing.id },
      data: {
        contactId: d.contactId !== undefined ? d.contactId : undefined,
        contactName: d.contactName !== undefined ? d.contactName : undefined,
        projectId: d.projectId !== undefined ? d.projectId : undefined,
        projectName: d.projectName !== undefined ? d.projectName : undefined,
        constructionTrade: d.constructionTrade !== undefined ? d.constructionTrade : undefined,
        transcript: d.transcript !== undefined ? d.transcript : undefined,
        userNotes: d.userNotes !== undefined ? d.userNotes : undefined,
        videoAssetId: d.videoAssetId !== undefined ? d.videoAssetId : undefined,
        analysisJson: d.analysis !== undefined ? (d.analysis as object) : undefined,
        scopeSummary: d.scopeSummary !== undefined ? d.scopeSummary : undefined,
        assumptionsJson: d.assumptions !== undefined ? d.assumptions : undefined,
        status: d.status,
      },
      include: { assets: true },
    });

    return NextResponse.json({ draft: mapSessionToDraft(session, session.assets) });
  } catch (err: unknown) {
    log.error("patch session failed", {
      message: prismaErrorMessage(err),
      code: prismaErrorCode(err),
    });
    return NextResponse.json({ error: "שגיאה בעדכון" }, { status: 500 });
  }
});
