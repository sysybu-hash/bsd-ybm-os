import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { runTriEngineExtractionValidated } from "@/lib/tri-engine-extract";
import {
  buildTriEngineAiDataRecord,
  loadTriEngineExtractionInput,
  mergeProjectClientIntoV5,
  parseTriEngineFormData,
  persistTriEngineToErp,
  triEngineAuthorizeAndCharge,
  triEngineCreditKindFor,
  validateTriEngineRequest,
} from "@/lib/tri-engine-api-common";

export const dynamic = "force-dynamic";
/** ליטרל בלבד — Next.js לא מקבל ייבוא ל־maxDuration */
export const maxDuration = 300;

export const POST = withWorkspacesAuth(async (req, { userId, orgId }) => {
  // rate limit: 20 סריקות/דקה per user (scan הוא פעולה יקרה)
  try {
    const userRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const session = {
      user: {
        id: userId,
        organizationId: orgId,
        email: userRow?.email ?? null,
      },
    } as Session;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonBadRequest("גוף בקשה לא תקין", "invalid_form");
    }

    const parsed = parseTriEngineFormData(formData);
    if (!parsed) {
      return jsonBadRequest("לא נמצא קובץ", "missing_file");
    }

    const reqValidation = validateTriEngineRequest(parsed);
    if (!reqValidation.ok) {
      return NextResponse.json({ error: reqValidation.error, code: reqValidation.code }, { status: reqValidation.status });
    }

    const gate = await triEngineAuthorizeAndCharge(
      session,
      triEngineCreditKindFor(parsed.scanMode, parsed.engineRunMode),
    );
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, code: gate.code, resetAt: gate.resetAt },
        { status: gate.status },
      );
    }

    const input = await loadTriEngineExtractionInput(
      parsed.file,
      parsed.scanMode,
      gate.userId,
      parsed.openAiModel,
      parsed.engineRunMode,
      parsed.userInstruction,
    );

    const { v5, telemetry, validation } = await runTriEngineExtractionValidated({
      ...input,
    });

    const v5Merged = mergeProjectClientIntoV5(v5, parsed.projectLabel, parsed.clientLabel);
    const aiData = buildTriEngineAiDataRecord(v5Merged, telemetry);
    if (validation) aiData._validation = validation;

    if (!parsed.persist) {
      return NextResponse.json({
        ok: true,
        aiData,
        telemetry,
        validation,
        usageWarnings: gate.usageWarnings,
      });
    }

    const { documentId, driveWebViewLink } = await persistTriEngineToErp({
      file: parsed.file,
      aiData,
      userId: gate.userId,
      organizationId: gate.organizationId,
    });

    return NextResponse.json({
      ok: true,
      documentId,
      driveWebViewLink,
      aiData,
      telemetry,
      validation,
      usageWarnings: gate.usageWarnings,
    });
  } catch (e) {
    return apiErrorResponse(e, "[tri-engine]");
  }
}, { rateLimit: { key: "scan:tri-engine", limit: 20, windowMs: 60_000 } });
