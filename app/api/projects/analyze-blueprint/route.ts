import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { assertProviderConfigured } from "@/lib/ai-providers";
import { analyzeBlueprintFile } from "@/lib/projects/blueprint-analyze";
import { prisma } from "@/lib/prisma";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;
const REQUESTS_PER_HOUR = 15;

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    const rateKey = `blueprint:org:${orgId}:user:${userId}`;
    const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(
        `הגבלת קצב לפענוח גרמושקה. נסו שוב אחרי ${rl.resetAt.toISOString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt },
      );
    }

    const geminiErr = assertProviderConfigured("gemini");
    if (geminiErr) {
      return jsonBadRequest(geminiErr, "gemini_not_configured");
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const projectId = String(formData.get("projectId") ?? "").trim();

    if (!(file instanceof File) || !projectId) {
      return jsonBadRequest("קובץ או מזהה פרויקט חסרים", "missing_fields");
    }

    if (file.size > MAX_BYTES) {
      return jsonBadRequest("הקובץ גדול מדי (מקסימום 15MB)", "file_too_large");
    }

    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "application/pdf";

    const parsed = await analyzeBlueprintFile(base64, mimeType);

    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    await prisma.$transaction(async (tx) => {
      if (parsed.tasks.length > 0) {
        await tx.task.createMany({
          data: parsed.tasks.map((t, i) => ({
            projectId,
            organizationId: orgId,
            title: t.name,
            startDate: t.startDate ? new Date(t.startDate) : new Date(now + i * weekMs),
            endDate: t.endDate
              ? new Date(t.endDate)
              : new Date(now + (i + 1) * weekMs),
            progress: 0,
            status: "TODO",
          })),
        });
      }

      if (parsed.milestones.length > 0) {
        await tx.paymentMilestone.createMany({
          data: parsed.milestones.map((m, i) => ({
            projectId,
            organizationId: orgId,
            name: m.name,
            amount: typeof m.amount === "number" ? m.amount : parseFloat(String(m.amount)) || 0,
            sortOrder: i,
          })),
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: "כתב הכמויות הופק והוזן בהצלחה",
      tasksCreated: parsed.tasks.length,
      milestonesCreated: parsed.milestones.length,
    });
  } catch (error) {
    return apiErrorResponse(error, "analyze-blueprint");
  }
});
