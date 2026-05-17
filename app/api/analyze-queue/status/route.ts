import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { toPublicJobStatus } from "@/lib/analyze-queue";
import { apiErrorResponse } from "@/lib/api-route-helpers";

export const dynamic = "force-dynamic";

const statusQuerySchema = z.object({
  jobId: z.string().min(1),
});

export const GET = withWorkspacesAuth(
  async (_req, { userId }, data) => {
    try {
      const job = await prisma.documentScanJob.findFirst({
        where: { id: data.jobId, userId },
        select: { status: true, result: true, error: true },
      });

      if (!job) {
        return jsonNotFound("לא נמצאה משימה");
      }

      const status = toPublicJobStatus(job.status);
      if (status === "completed") {
        return NextResponse.json({ status, result: job.result ?? null, error: null });
      }
      if (status === "failed") {
        return NextResponse.json({ status, result: null, error: job.error ?? "failed" });
      }

      const silentRetry =
        job.error === "rate_limited_retry" || job.error === "stale_processing_requeue";

      return NextResponse.json({
        status,
        result: null,
        error: job.error && !silentRetry ? job.error : null,
      });
    } catch (err: unknown) {
      return apiErrorResponse(err, "[analyze-queue/status]");
    }
  },
  { schema: statusQuerySchema, parseTarget: "query" },
);
