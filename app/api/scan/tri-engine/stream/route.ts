import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runTriEngineExtraction, type TriEngineProgressEvent } from "@/lib/tri-engine-extract";
import {
  buildTriEngineAiDataRecord,
  loadTriEngineExtractionInput,
  mergeProjectClientIntoV5,
  parseTriEngineFormData,
  persistTriEngineToErp,
  triEngineAuthorizeAndCharge,
  triEngineCreditKindFor,
  triEngineNdjsonErrorResponse,
  validateTriEngineRequest,
} from "@/lib/tri-engine-api-common";

export const dynamic = "force-dynamic";
/** ליטרל בלבד — Next.js לא מקבל ייבוא ל־maxDuration */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return triEngineNdjsonErrorResponse(401, { error: "Unauthorized" });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return triEngineNdjsonErrorResponse(400, { error: "גוף בקשה לא תקין" });
  }

  const parsed = parseTriEngineFormData(formData);
  if (!parsed) {
    return triEngineNdjsonErrorResponse(400, { error: "לא נמצא קובץ" });
  }

  const validation = validateTriEngineRequest(parsed);
  if (!validation.ok) {
    return triEngineNdjsonErrorResponse(validation.status, {
      error: validation.error,
      code: validation.code,
    });
  }

  const gate = await triEngineAuthorizeAndCharge(
    session,
    triEngineCreditKindFor(parsed.scanMode, parsed.engineRunMode),
  );
  if (!gate.ok) {
    return triEngineNdjsonErrorResponse(gate.status, {
      error: gate.error,
      code: gate.code,
      resetAt: gate.resetAt,
    });
  }

  const input = await loadTriEngineExtractionInput(
    parsed.file,
    parsed.scanMode,
    gate.userId,
    parsed.openAiModel,
    parsed.engineRunMode,
    parsed.userInstruction,
  );

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const writeLine = async (obj: unknown) => {
    await writer.write(enc.encode(`${JSON.stringify(obj)}\n`));
  };

  (async () => {
    try {
      await writeLine({ type: "start", usageWarnings: gate.usageWarnings });

      const { v5, telemetry } = await runTriEngineExtraction({
        ...input,
        onProgress: async (e: TriEngineProgressEvent) => {
          await writeLine(e);
        },
      });

      const v5Merged = mergeProjectClientIntoV5(v5, parsed.projectLabel, parsed.clientLabel);
      const aiData = buildTriEngineAiDataRecord(v5Merged, telemetry);

      if (!parsed.persist) {
        await writeLine({
          type: "done",
          ok: true,
          aiData,
          telemetry,
          usageWarnings: gate.usageWarnings,
        });
        return;
      }

      const { documentId } = await persistTriEngineToErp({
        file: parsed.file,
        aiData,
        userId: gate.userId,
        organizationId: gate.organizationId,
      });

      await writeLine({
        type: "done",
        ok: true,
        documentId,
        aiData,
        telemetry,
        usageWarnings: gate.usageWarnings,
      });
    } catch (e) {
      console.error("[tri-engine stream]", e);
      const msg = e instanceof Error ? e.message : String(e);
      await writeLine({ type: "error", error: msg.slice(0, 500) });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
