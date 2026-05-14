import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonServerError } from "@/lib/api-json";
import { runTriEngineExtraction } from "@/lib/tri-engine-extract";
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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const validation = validateTriEngineRequest(parsed);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error, code: validation.code }, { status: validation.status });
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

    const { v5, telemetry } = await runTriEngineExtraction({
      ...input,
    });

    const v5Merged = mergeProjectClientIntoV5(v5, parsed.projectLabel, parsed.clientLabel);
    const aiData = buildTriEngineAiDataRecord(v5Merged, telemetry);

    if (!parsed.persist) {
      return NextResponse.json({
        ok: true,
        aiData,
        telemetry,
        usageWarnings: gate.usageWarnings,
      });
    }

    const { documentId } = await persistTriEngineToErp({
      file: parsed.file,
      aiData,
      userId: gate.userId,
      organizationId: gate.organizationId,
    });

    return NextResponse.json({
      ok: true,
      documentId,
      aiData,
      telemetry,
      usageWarnings: gate.usageWarnings,
    });
  } catch (e) {
    console.error("[tri-engine]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return jsonServerError(msg.slice(0, 500));
  }
}
