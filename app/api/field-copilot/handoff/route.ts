import { NextResponse, type NextRequest } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { jsonBadRequest } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { isFieldCopilotEnabled } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { fieldCopilotHandoffSchema } from "@/lib/validation/schemas/field-copilot";
import { buildFieldCopilotDocCreatorLiveData } from "@/lib/field-copilot/handoff";
import { parseAnalysisJson } from "@/lib/field-copilot/session-mapper";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const log = createLogger("api/field-copilot/handoff");

export const POST = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "field-copilot:handoff", 20, 60_000);
  if (limited) return limited;

  const blocked = await guardConstructionOnlyApi(orgId);
  if (blocked) return blocked;

  if (!(await isFieldCopilotEnabled())) {
    return NextResponse.json({ error: "קופיילוט שטח מושבת" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = fieldCopilotHandoffSchema.safeParse(body);
  if (!parsed.success) return jsonBadRequest("בקשה לא תקינה", "invalid_body");

  const session = await prisma.fieldCopilotSession.findFirst({
    where: { id: parsed.data.sessionId, organizationId: orgId, userId },
  });
  if (!session) return NextResponse.json({ error: "סשן לא נמצא" }, { status: 404 });

  const extraction = parseAnalysisJson(session.analysisJson);
  if (!extraction) {
    return jsonBadRequest("חסר ניתוח — הרץ ניתוח קודם", "missing_analysis");
  }

  const liveData = buildFieldCopilotDocCreatorLiveData({
    target: parsed.data.target,
    extraction,
    projectId: session.projectId,
    projectName: session.projectName,
    contactId: session.contactId,
    contactName: session.contactName,
  });

  try {
    let quoteId: string | undefined;
    if (session.contactId && parsed.data.target === "QUOTE") {
      const total = extraction.lineItems.reduce(
        (sum, row) => sum + (row.lineTotal ?? (row.unitPrice ?? 0) * (row.quantity ?? 1)),
        0,
      );
      const quote = await prisma.quote.create({
        data: {
          organizationId: orgId,
          contactId: session.contactId,
          amount: total,
          status: "PENDING",
          token: randomBytes(24).toString("hex"),
        },
      });
      quoteId = quote.id;
    }

    await prisma.fieldCopilotSession.update({
      where: { id: session.id },
      data: {
        status: "HANDED_OFF",
        handedOffAt: new Date(),
        quoteId: quoteId ?? session.quoteId,
      },
    });

    return NextResponse.json({ liveData, quoteId, sessionId: session.id });
  } catch (err: unknown) {
    log.error("handoff failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "שגיאה בהעברה למסמך" }, { status: 500 });
  }
});
