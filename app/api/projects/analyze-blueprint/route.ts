import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { assertProviderConfigured } from "@/lib/ai-providers";
import { analyzeBlueprintFile, type BlueprintEngineRunMode } from "@/lib/projects/blueprint-analyze";
import { prisma } from "@/lib/prisma";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  blueprintTaskSchema,
  blueprintMilestoneSchema,
  blueprintBoqLineSchema,
} from "@/lib/projects/blueprint-analysis-schema";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;
const REQUESTS_PER_HOUR = 15;

const confirmBodySchema = z.object({
  projectId: z.string().min(1),
  tasks: z.array(blueprintTaskSchema).default([]),
  milestones: z.array(blueprintMilestoneSchema).default([]),
  boqLineItems: z.array(blueprintBoqLineSchema).default([]),
});

async function saveAnalysis(
  projectId: string,
  orgId: string,
  data: z.infer<typeof confirmBodySchema>,
) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  await prisma.$transaction(async (tx) => {
    if (data.tasks.length > 0) {
      await tx.task.createMany({
        data: data.tasks.map((t, i) => ({
          projectId,
          organizationId: orgId,
          title: t.name,
          startDate: t.startDate ? new Date(t.startDate) : new Date(now + i * weekMs),
          endDate: t.endDate ? new Date(t.endDate) : new Date(now + (i + 1) * weekMs),
          progress: 0,
          status: "TODO",
        })),
      });
    }

    if (data.milestones.length > 0) {
      await tx.paymentMilestone.createMany({
        data: data.milestones.map((m, i) => {
          const pctRaw = m.percent;
          const pct =
            pctRaw != null
              ? typeof pctRaw === "number"
                ? pctRaw
                : parseFloat(String(pctRaw))
              : null;
          const amtRaw = m.amount;
          const amt =
            amtRaw != null
              ? typeof amtRaw === "number"
                ? amtRaw
                : parseFloat(String(amtRaw)) || 0
              : 0;
          const usePercent = pct != null && Number.isFinite(pct) && pct >= 0 && pct <= 100;
          return {
            projectId,
            organizationId: orgId,
            name: m.name,
            amount: usePercent ? 0 : amt,
            percent: usePercent ? pct : null,
            sortOrder: i,
          };
        }),
      });
    }

    if (data.boqLineItems.length > 0) {
      await tx.projectBoqLine.createMany({
        data: data.boqLineItems.map((b, i) => ({
          projectId,
          organizationId: orgId,
          description: b.description,
          unit: b.unit ?? null,
          quantity: b.quantity ?? null,
          unitPrice: null,
          lineTotal: 0,
          sortOrder: i,
          source: "BLUEPRINT",
        })),
      });
    }
  });

  return {
    tasksCreated: data.tasks.length,
    milestonesCreated: data.milestones.length,
    boqItemsCreated: data.boqLineItems.length,
  };
}

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

    const contentType = req.headers.get("content-type") ?? "";

    // Confirm phase: JSON body with selected items to save
    if (contentType.includes("application/json")) {
      const raw = (await req.json()) as unknown;
      const body = confirmBodySchema.safeParse(raw);
      if (!body.success) return jsonBadRequest("נתונים לא תקינים", "invalid_body");

      const industryBlock = await guardConstructionOnlyApi(orgId);
      if (industryBlock) return industryBlock;

      const gate = await requireProjectForOrg(body.data.projectId, orgId);
      if (!gate.ok) return gate.response;

      const counts = await saveAnalysis(body.data.projectId, orgId, body.data);
      return NextResponse.json({
        success: true,
        message: "כתב הכמויות הופק והוזן בהצלחה",
        ...counts,
      });
    }

    // Preview / full-save phase: FormData with file
    const geminiErr = assertProviderConfigured("gemini");
    if (geminiErr) return jsonBadRequest(geminiErr, "gemini_not_configured");

    const formData = await req.formData();
    const file = formData.get("file");
    const projectId = String(formData.get("projectId") ?? "").trim();
    const isPreview = formData.get("preview") === "true";

    if (!(file instanceof File) || !projectId) {
      return jsonBadRequest("קובץ או מזהה פרויקט חסרים", "missing_fields");
    }
    if (file.size > MAX_BYTES) {
      return jsonBadRequest("הקובץ גדול מדי (מקסימום 15MB)", "file_too_large");
    }

    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;

    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const engineRunMode = (formData.get("engineRunMode") as BlueprintEngineRunMode | null) ?? "AUTO";
    const userInstruction = formData.get("userInstruction") as string | null;

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "application/pdf";

    const parsed = await analyzeBlueprintFile(base64, mimeType, { engineRunMode, userInstruction });

    if (isPreview) {
      return NextResponse.json({ preview: true, ...parsed });
    }

    const counts = await saveAnalysis(projectId, orgId, { projectId, ...parsed });
    return NextResponse.json({
      success: true,
      message: "כתב הכמויות הופק והוזן בהצלחה",
      ...counts,
    });
  } catch (error) {
    return apiErrorResponse(error, "analyze-blueprint");
  }
});
