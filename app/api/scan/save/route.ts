import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { unifiedSaveScan } from "@/lib/scan/unified-save";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const saveBodySchema = z.object({
  target: z.enum(["erp", "crm", "project", "notebook", "expense"]),
  fileName: z.string().min(1),
  v5: z.record(z.string(), z.unknown()),
  aiData: z.record(z.string(), z.unknown()).optional(),
  projectId: z.string().optional(),
  contactId: z.string().optional(),
  documentId: z.string().optional(),
});

const VALID_TARGETS = new Set<UnifiedSaveTarget>(["erp", "crm", "project", "notebook", "expense"]);

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  const limited = await applyRateLimit(req, "scan:save", 30, 60_000);
  if (limited) return limited;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const rawJson = formData.get("payload");
    if (!(file instanceof File)) {
      return jsonBadRequest("חסר קובץ", "missing_file");
    }
    if (typeof rawJson !== "string") {
      return jsonBadRequest("חסר payload", "missing_payload");
    }

    let parsed: z.infer<typeof saveBodySchema>;
    try {
      parsed = saveBodySchema.parse(JSON.parse(rawJson));
    } catch {
      return jsonBadRequest("payload לא תקין", "invalid_payload");
    }

    if (!VALID_TARGETS.has(parsed.target)) {
      return jsonBadRequest("יעד שמירה לא תקין", "invalid_target");
    }

    if (parsed.target === "notebook") {
      return jsonBadRequest("השתמש ב-/api/notebooklm/from-scan למחברת", "use_notebook_endpoint");
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { industry: true },
    });

    const result = await unifiedSaveScan(
      {
        file,
        fileName: parsed.fileName,
        v5: parsed.v5 as import("@/lib/scan-schema-v5").ScanExtractionV5,
        aiData: parsed.aiData ?? {},
        target: parsed.target,
        userId,
        organizationId: orgId,
        projectId: parsed.projectId ?? null,
        contactId: parsed.contactId ?? null,
        documentId: parsed.documentId ?? null,
      },
      { userId, organizationId: orgId, industry: org?.industry ?? undefined },
    );

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      documentId: result.documentId,
      driveWebViewLink: result.driveWebViewLink,
      appliedPostActions: result.appliedPostActions,
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "scan/save");
  }
});
