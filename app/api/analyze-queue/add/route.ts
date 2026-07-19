import { NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  jsonBadRequest,
  jsonServiceUnavailable,
  jsonTooManyRequests,
} from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import type { DocumentScanFilePayload } from "@/lib/analyze-queue";
import { createLogger } from "@/lib/logger";

const log = createLogger("analyze-queue-add");
import { drainDocumentScanQueue } from "@/lib/analyze-queue-runner";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import {
  mapLegacyAnalysisTypeToScanMode,
  mapLegacyProviderToEngineRunMode,
} from "@/lib/scan/legacy-map";

const QUEUE_ENQUEUE_PER_HOUR = 60;
const QUEUE_ENQUEUE_PER_HOUR_PLATFORM = 200;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    if (process.env.NODE_ENV === "production" && !env.ANALYZE_QUEUE_SECRET?.trim()) {
      return jsonServiceUnavailable(
        "חסר ANALYZE_QUEUE_SECRET — לא ניתן להריץ את תור הסריקה בייצור.",
        "queue_secret_missing",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, organization: { select: { industry: true, constructionTrade: true } } },
    });
    const dev = isAdmin(user?.email);
    const limit = dev ? QUEUE_ENQUEUE_PER_HOUR_PLATFORM : QUEUE_ENQUEUE_PER_HOUR;
    const rateKey = `scan-queue-enqueue:org:${orgId}`;
    const rl = await checkRateLimit(rateKey, limit, 60 * 60 * 1000);

    if (!rl.success) {
      return jsonTooManyRequests(
        `חרגת ממכסת השימוש המותרת לשעה זו. נסה שוב לאחר ${rl.resetAt.toLocaleTimeString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt.toISOString() },
      );
    }

    // Daily per-org AI enqueue cap (cost guard)
    const dailyLimit = dev ? 500 : 120;
    const dailyKey = `scan-queue-enqueue:day:org:${orgId}`;
    const daily = await checkRateLimit(dailyKey, dailyLimit, 24 * 60 * 60 * 1000);
    if (!daily.success) {
      log.warn("analyze_queue_daily_cap", { orgId, dailyLimit });
      return jsonTooManyRequests(
        "חרגת ממכסת סריקות AI היומית לארגון. נסה שוב מחר או פנה לתמיכה.",
        "daily_ai_cap",
        { resetAt: daily.resetAt.toISOString() },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonBadRequest("לא נמצא קובץ", "missing_file");
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const persist = formData.get("persist") === "true";
    const analysisType = String(formData.get("analysisType") ?? "INVOICE");
    const provider = String(formData.get("provider") ?? "gemini");

    const payload: DocumentScanFilePayload = {
      kind: "inline",
      base64,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      provider,
      analysisType,
      industry: user?.organization?.industry ?? "CONSTRUCTION",
      language: String(formData.get("language") ?? "auto"),
      model: String(formData.get("model") ?? ""),
      persist,
      scanMode: mapLegacyAnalysisTypeToScanMode(
        String(formData.get("scanMode") ?? analysisType),
      ),
      engineRunMode: mapLegacyProviderToEngineRunMode(
        String(formData.get("engineRunMode") ?? provider),
      ),
    };

    const job = await prisma.documentScanJob.create({
      data: {
        status: "PENDING",
        fileData: JSON.stringify(payload),
        userId,
        organizationId: orgId,
      },
    });

    after(async () => {
      try {
        await drainDocumentScanQueue(40);
      } catch (e) {
        log.error("after() drain failed", { error: e instanceof Error ? e.message : String(e) });
      }
    });

    return NextResponse.json({ jobId: job.id });
  } catch (err: unknown) {
    return apiErrorResponse(err, "[analyze-queue/add]");
  }
});
