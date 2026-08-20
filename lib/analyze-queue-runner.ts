import { Prisma } from "@prisma/client";
import type { DocumentScanJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processDocumentAction } from "@/app/actions/process-document";
import { isDocumentScanRateLimitError, parseJobFileData, type DocumentScanFilePayload } from "@/lib/analyze-queue";
import {
  mapLegacyAnalysisTypeToScanMode,
  mapLegacyProviderToEngineRunMode,
  unifiedExtractFromFile,
} from "@/lib/scan/unified-extract";
import { unifiedSaveScan } from "@/lib/scan/unified-save";
import { isScanUnifiedV2Enabled } from "@/lib/scan/feature-flag";
import { createLogger } from "@/lib/logger";
const log = createLogger("analyze-queue-runner");

/** אחרי timeout / קריסה — משימה עלולה להישאר ב־PROCESSING */
const STALE_PROCESSING_MS = 10 * 60 * 1000;

export async function requeueStaleDocumentScanJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  await prisma.documentScanJob.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: cutoff },
    },
    data: {
      status: "PENDING",
      error: "stale_processing_requeue",
    },
  });
}

export async function claimNextPendingDocumentScanJob(): Promise<DocumentScanJob | null> {
  const pendingCount = await prisma.documentScanJob.count({
    where: { status: "PENDING" },
  });
  if (pendingCount === 0) return null;

  for (let attempt = 0; attempt < 12; attempt++) {
    const job = await prisma.$transaction(async (tx) => {
      const candidate = await tx.documentScanJob.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
      });
      if (!candidate) return null;
      const updated = await tx.documentScanJob.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: { status: "PROCESSING" },
      });
      if (updated.count !== 1) return null;
      return tx.documentScanJob.findUnique({ where: { id: candidate.id } });
    });
    if (job) return job;

    const still = await prisma.documentScanJob.count({
      where: { status: "PENDING" },
    });
    if (still === 0) return null;
  }
  return null;
}

async function fileFromPayload(payload: DocumentScanFilePayload): Promise<File> {
  if (payload.kind === "inline") {
    const buf = Buffer.from(payload.base64, "base64");
    return new File([buf], payload.fileName, { type: payload.mimeType });
  }

  const res = await fetch(payload.url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`הורדת קובץ מה-URL נכשלה (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return new File([buf], payload.fileName, { type: payload.mimeType });
}

export async function executeDocumentScanJob(job: DocumentScanJob): Promise<void> {
  try {
    const payload = parseJobFileData(job.fileData);
    const file = await fileFromPayload(payload);

    if (isScanUnifiedV2Enabled()) {
      const scanMode =
        payload.scanMode ?? mapLegacyAnalysisTypeToScanMode(payload.analysisType);
      const engineRunMode =
        payload.engineRunMode ?? mapLegacyProviderToEngineRunMode(payload.provider);

      const extracted = await unifiedExtractFromFile({
        file,
        userId: job.userId,
        scanMode,
        engineRunMode,
        industry: payload.industry,
      });

      let resultData: Record<string, unknown> = {
        success: true,
        data: extracted.aiData,
        v5: extracted.v5,
        telemetry: extracted.telemetry,
      };

      if (payload.persist) {
        const saved = await unifiedSaveScan(
          {
            file,
            fileName: payload.fileName,
            v5: extracted.v5,
            aiData: extracted.aiData,
            target: "erp",
            userId: job.userId,
            organizationId: job.organizationId,
          },
          { userId: job.userId, organizationId: job.organizationId, industry: payload.industry },
        );
        if (!saved.ok) {
          throw new Error(saved.error ?? "שמירה נכשלה");
        }
        resultData = {
          ...resultData,
          documentId: saved.documentId,
          driveWebViewLink: saved.driveWebViewLink,
        };
      }

      await prisma.documentScanJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          result: resultData as Prisma.InputJsonValue,
          error: null,
        },
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("provider", payload.provider);
    formData.append("persist", payload.persist ? "true" : "false");
    formData.append("industry", payload.industry);
    formData.append("analysisType", payload.analysisType);
    formData.append("language", payload.language);
    formData.append("model", payload.model);
    formData.append("autoCreateClient", "false");

    const result = await processDocumentAction(
      formData,
      job.userId,
      job.organizationId,
      payload.persist,
    );

    if (!result.success) {
      const errText = result.error ?? "";
      if (isDocumentScanRateLimitError({ message: errText })) {
        await prisma.documentScanJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            error: "rate_limited_retry",
          },
        });
      } else {
        await prisma.documentScanJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: errText.slice(0, 4000),
          },
        });
      }
      return;
    }

    await prisma.documentScanJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        result: result.data as Prisma.InputJsonValue,
        error: null,
      },
    });
  } catch (e) {
    log.error("analyze_queue_job_failed", e, { jobId: job.id });
    if (isDocumentScanRateLimitError(e)) {
      await prisma.documentScanJob.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          error: "rate_limited_retry",
        },
      });
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.documentScanJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: msg.slice(0, 4000),
        },
      });
    }
  }
}

/**
 * מרוקן עד maxJobs משימות ברצף — בלי fetch פנימי (מתאים ל-Vercel + after/waitUntil).
 */
export async function drainDocumentScanQueue(maxJobs = 30): Promise<number> {
  await requeueStaleDocumentScanJobs();
  let done = 0;
  for (let i = 0; i < maxJobs; i++) {
    const job = await claimNextPendingDocumentScanJob();
    if (!job) break;
    await executeDocumentScanJob(job);
    done++;
  }
  return done;
}
