import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonNotFound, jsonServerError, jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { toPublicJobStatus } from "@/lib/analyze-queue";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    const jobId = req.nextUrl.searchParams.get("jobId")?.trim();
    if (!jobId) {
      return jsonBadRequest("חסר jobId", "missing_job_id");
    }

    const job = await prisma.documentScanJob.findFirst({
      where: { id: jobId, userId: session.user.id },
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
  } catch (error) {
    console.error("[analyze-queue/status]", error);
    return jsonServerError("שגיאה פנימית");
  }
}
