import type { Session } from "next-auth";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { runTriEngineExtractionValidated } from "@/lib/tri-engine-extract-validated";
import type { TriEngineProgressEvent } from "@/lib/tri-engine-extract";
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
import { classifyScanDocumentHeuristic, shouldAutoClassifyDocumentType } from "@/lib/scan-classify";
import { classifyScanDocumentByContent } from "@/lib/scan-classify-ai";
import { resolveTriEnginePlan } from "@/lib/scan-engine-router";
import { checkRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("scan-tri-engine-stream");

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

  const orgRow = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { industry: true },
  });
  const orgIndustry = orgRow?.industry ?? "CONSTRUCTION";

  // ── סיווג היברידי (הוריסטיקה → AI לפי confidence) ──────────────────────
  // רץ לפני authorize כי משפיע על credit kind
  const HEURISTIC_CONFIDENCE_THRESHOLD = 0.8; // מעל זה → לא צריך AI
  const AI_UNCERTAIN_THRESHOLD = 0.6;          // מתחת לזה → שאל את המשתמש

  let scanMode = parsed.scanMode;
  let engineRunMode = parsed.engineRunMode;
  let resolvedClassification = null as Awaited<ReturnType<typeof classifyScanDocumentByContent>>;

  if (
    shouldAutoClassifyDocumentType({
      scanMode: parsed.scanMode,
      engineRunMode,
      docTypeAutoDetect: parsed.docTypeAutoDetect,
    })
  ) {
    const mime = parsed.file.type || "application/octet-stream";
    const heuristic = classifyScanDocumentHeuristic({
      fileName: parsed.file.name,
      mimeType: mime,
      userInstruction: parsed.userInstruction,
      industry: orgIndustry,
    });

    if (heuristic.confidence >= HEURISTIC_CONFIDENCE_THRESHOLD) {
      // הוריסטיקה בטוחה — לא צריך AI call
      scanMode = heuristic.scanMode;
      resolvedClassification = heuristic;
    } else {
      // ביטחון נמוך → Gemini Flash מסווג לפי תוכן
      const fileBuffer = await parsed.file.arrayBuffer();
      const base64 = Buffer.from(fileBuffer).toString("base64");
      const aiClass = await classifyScanDocumentByContent({
        base64,
        mimeType: mime,
        industry: orgIndustry,
      });
      // שמור base64 כדי לא לקרוא שוב — ניצרף ל-input
      resolvedClassification = aiClass ?? heuristic;
      scanMode = resolvedClassification.scanMode;
    }

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

      if (resolvedClassification && (parsed.docTypeAutoDetect || parsed.engineRunMode === "AUTO")) {
        const plan = resolveTriEnginePlan(resolvedClassification.scanMode, "AUTO");
        await writeLine({
          type: "classification",
          scanMode: resolvedClassification.scanMode,
          confidence: resolvedClassification.confidence,
          rationale: resolvedClassification.rationale,
          engineRunMode: plan.effectiveRunMode,
          providerChain: plan.providerChain,
          // סף לא-ודאי: הלקוח יכול להציג "זוהה כ-X, האם נכון?"
          uncertain: resolvedClassification.confidence < AI_UNCERTAIN_THRESHOLD,
        });
      }

      const { v5, telemetry, validation } = await runTriEngineExtractionValidated({
        ...input,
        customEngines: parsed.customEngines,
        onProgress: async (e: TriEngineProgressEvent) => {
          await writeLine(e);
        },
      });

      const v5Merged = mergeProjectClientIntoV5(v5, parsed.projectLabel, parsed.clientLabel);
      const aiData = buildTriEngineAiDataRecord(v5Merged, telemetry);
      if (validation) aiData._validation = validation;

      if (!parsed.persist) {
        await writeLine({
          type: "done",
          ok: true,
          aiData,
          telemetry,
          validation,
          usageWarnings: gate.usageWarnings,
        });
        return;
      }

      const { documentId, driveWebViewLink } = await persistTriEngineToErp({
        file: parsed.file,
        aiData,
        userId: gate.userId,
        organizationId: gate.organizationId,
      });

      await writeLine({
        type: "done",
        ok: true,
        documentId,
        driveWebViewLink,
        aiData,
        telemetry,
        validation,
        usageWarnings: gate.usageWarnings,
      });
    } catch (e) {
      log.error("tri-engine stream failed", { error: e instanceof Error ? e.message : String(e) });
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
}, { rateLimit: false });
