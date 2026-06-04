import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { runBoqAgent } from "@/lib/boq/boq-agent";
import { boqAgentSuggestionSchema } from "@/lib/boq/boq-agent-schema";
import { getServerLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  prompt: z.string().min(3).max(2000),
  apply: z.boolean().optional(),
  suggestions: z.array(boqAgentSuggestionSchema).optional(),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof bodySchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const rl = await checkRateLimit(`boq:agent:${orgId}:${projectId}`, 20, 60 * 60 * 1000);
      if (!rl.success) {
        return jsonTooManyRequests("הגבלת בקשות לסוכן BOQ — נסה שוב מאוחר יותר", "rate_limited", {
          resetAt: rl.resetAt,
        });
      }

      const industryBlock = await guardConstructionOnlyApi(orgId);
      if (industryBlock) return industryBlock;

      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const project = await prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { name: true },
      });
      if (!project) return jsonBadRequest("פרויקט לא נמצא", "project_not_found");

      const lines = await prisma.projectBoqLine.findMany({
        where: { projectId, organizationId: orgId },
        orderBy: { sortOrder: "asc" },
        take: 200,
        select: {
          id: true,
          description: true,
          unit: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          isWorkDone: true,
          sortOrder: true,
        },
      });

      const locale = await getServerLocale();

      if (body.apply && body.suggestions?.length) {
        const lineIds = new Set(lines.map((l) => l.id));
        let applied = 0;
        const maxSort = lines.reduce((m, l) => Math.max(m, l.sortOrder), -1);

        await prisma.$transaction(async (tx) => {
          let nextSort = maxSort + 1;
          for (const s of body.suggestions!) {
            if (s.action === "add") {
              const qty = s.quantity ?? 0;
              const price = s.unitPrice ?? 0;
              await tx.projectBoqLine.create({
                data: {
                  projectId,
                  organizationId: orgId,
                  description: s.description,
                  unit: s.unit ?? null,
                  quantity: s.quantity ?? null,
                  unitPrice: s.unitPrice ?? null,
                  lineTotal: qty * price,
                  sortOrder: nextSort++,
                  source: "BOQ_AGENT",
                },
              });
              applied++;
            } else if (s.action === "update" && s.lineId && lineIds.has(s.lineId)) {
              const existing = lines.find((l) => l.id === s.lineId)!;
              const quantity = s.quantity ?? existing.quantity ?? 0;
              const unitPrice = s.unitPrice ?? existing.unitPrice ?? 0;
              await tx.projectBoqLine.update({
                where: { id: s.lineId },
                data: {
                  description: s.description || existing.description,
                  unit: s.unit ?? existing.unit,
                  quantity: s.quantity ?? existing.quantity,
                  unitPrice: s.unitPrice ?? existing.unitPrice,
                  lineTotal: quantity * unitPrice,
                },
              });
              applied++;
            }
          }
        });

        return NextResponse.json({ ok: true, applied });
      }

      const result = await runBoqAgent({
        projectName: project.name,
        userPrompt: body.prompt,
        lines,
        locale,
      });

      return NextResponse.json(result);
    } catch (error) {
      return apiErrorResponse(error, "boq-agent");
    }
  },
  { schema: bodySchema },
);
