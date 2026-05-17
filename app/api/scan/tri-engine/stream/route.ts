import type { Session } from "next-auth";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
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
import { classifyScanDocumentHeuristic } from "@/lib/scan-classify";
import { resolveTriEnginePlan } from "@/lib/scan-engine-router";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
/** ליטרל בלבד — Next.js לא מקבל ייבוא ל־maxDuration */
export const maxDuration = 300;

export const POST = withWorkspacesAuth(async (req, { userId, orgId }) => {
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

  const rl = await checkRateLimit(`scan:org:${orgId}`, 30, 60 * 60 * 1000);
  if (!rl.success) {
    return triEngineNdjsonErrorResponse(429, { error: "הגבלת קצב — נסו שוב מאוחר יותר" });
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

  let scanMode = parsed.scanMode;
  let engineRunMode = parsed.engineRunMode;
  if (engineRunMode === "AUTO") {
    const mime = parsed.file.type || "application/octet-stream";
    const classification = classifyScanDocumentHeuristic({
      fileName: parsed.file.name,
      mimeType: mime,
      userInstruction: parsed.userInstruction,
    });
    scanMode = classification.scanMode;
    const plan = resolveTriEnginePlan(scanMode, "AUTO");
    engineRunMode = plan.effectiveRunMode;
  }

  const gate = await triEngineAuthorizeAndCharge(
    session,
    triEngineCreditKindFor(scanMode, engineRunMode),
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
    scanMode,
    gate.userId,
    parsed.openAiModel,
    engineRunMode,
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
      if (parsed.engineRunMode === "AUTO") {
        const classification = classifyScanDocumentHeuristic({
          fileName: parsed.file.name,
          mimeType: parsed.file.type || "application/octet-stream",
          userInstruction: parsed.userInstruction,
        });
        const plan = resolveTriEnginePlan(classification.scanMode, "AUTO");
        await writeLine({
          type: "classification",
          scanMode: classification.scanMode,
          confidence: classification.confidence,
          rationale: classification.rationale,
          engineRunMode: plan.effectiveRunMode,
          providerChain: plan.providerChain,
        });
      }

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
});
