import { NextResponse, after } from "next/server";
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
import { drainDocumentScanQueue } from "@/lib/analyze-queue-runner";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const QUEUE_ENQUEUE_PER_HOUR = 60;
const QUEUE_ENQUEUE_PER_HOUR_PLATFORM = 200;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.ANALYZE_QUEUE_SECRET?.trim()) {
      return jsonServiceUnavailable(
        "חסר ANALYZE_QUEUE_SECRET — לא ניתן להריץ את תור הסריקה בייצור.",
        "queue_secret_missing",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
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

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonBadRequest("לא נמצא קובץ", "missing_file");
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const persist = formData.get("persist") !== "false";

    const payload: DocumentScanFilePayload = {
      kind: "inline",
      base64,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      provider: String(formData.get("provider") ?? "gemini"),
      analysisType: String(formData.get("analysisType") ?? "INVOICE"),
      industry: String(formData.get("industry") ?? "CONSTRUCTION"),
      language: String(formData.get("language") ?? "auto"),
      model: String(formData.get("model") ?? ""),
      persist,
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
        console.error("[analyze-queue/add] after() drain", e);
      }
    });

    return NextResponse.json({ jobId: job.id });
  } catch (err: unknown) {
    return apiErrorResponse(err, "[analyze-queue/add]");
  }
});
