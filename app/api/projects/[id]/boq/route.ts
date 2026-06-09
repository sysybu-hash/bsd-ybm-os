import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId }, segment) => {
  const { id } = await segment.params;
  try {
    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;
    const gate = await requireProjectForOrg(id, orgId);
    if (!gate.ok) return gate.response;

    const quoteId = new URL(req.url).searchParams.get("quoteId") ?? undefined;

    const [lines, quotes, bills] = await Promise.all([
      prisma.projectBoqLine.findMany({
        where: { projectId: id, organizationId: orgId, ...(quoteId ? { quoteId } : {}) },
        orderBy: { sortOrder: "asc" },
        include: { phaseColumns: true },
      }),
      prisma.projectQuote.findMany({
        where: { projectId: id, organizationId: orgId },
        orderBy: { version: "desc" },
      }),
      prisma.progressBill.findMany({
        where: { projectId: id, organizationId: orgId },
        orderBy: { billNumber: "asc" },
        include: { lines: true },
      }),
    ]);

    return NextResponse.json({ lines, quotes, bills });
  } catch (error) {
    return apiErrorResponse(error, "Project BOQ GET");
  }
});

const createLineSchema = z.object({
  description: z.string().min(1).max(1000),
  unit: z.string().max(40).optional(),
  quantity: z.number().nonnegative().optional(),
  unitPrice: z.number().nonnegative().optional(),
  quoteId: z.string().optional(),
  /** מקור השורה — לדוגמה "TAKEOFF" למדידה משרטוט */
  source: z.string().max(40).optional(),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof createLineSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const industryBlock = await guardConstructionOnlyApi(orgId);
      if (industryBlock) return industryBlock;
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const quantity = body.quantity ?? 0;
      const unitPrice = body.unitPrice ?? 0;
      const lineTotal = quantity * unitPrice;

      // append at the end — next sortOrder after the current max
      const agg = await prisma.projectBoqLine.aggregate({
        where: { projectId, organizationId: orgId },
        _max: { sortOrder: true },
      });
      const nextSortOrder = (agg._max.sortOrder ?? -1) + 1;

      const created = await prisma.projectBoqLine.create({
        data: {
          projectId,
          organizationId: orgId,
          quoteId: body.quoteId ?? null,
          sortOrder: nextSortOrder,
          description: body.description,
          unit: body.unit ?? null,
          quantity: body.quantity ?? null,
          unitPrice: body.unitPrice ?? null,
          lineTotal,
          source: body.source ?? "MANUAL",
        },
        include: { phaseColumns: true },
      });

      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      return apiErrorResponse(error, "Project BOQ POST");
    }
  },
  { schema: createLineSchema },
);

const patchLineSchema = z.object({
  id: z.string(),
  executedQuantity: z.number().optional(),
  progressCoefficient: z.number().optional(),
  isWorkDone: z.boolean().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  description: z.string().optional(),
});

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchLineSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const industryBlock = await guardConstructionOnlyApi(orgId);
      if (industryBlock) return industryBlock;
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const line = await prisma.projectBoqLine.findFirst({
        where: { id: body.id, projectId, organizationId: orgId },
      });
      if (!line) return NextResponse.json({ error: "שורה לא נמצאה" }, { status: 404 });

      const quantity = body.quantity ?? line.quantity ?? 0;
      const unitPrice = body.unitPrice ?? line.unitPrice ?? 0;
      const lineTotal =
        body.quantity != null || body.unitPrice != null ? quantity * unitPrice : line.lineTotal;

      const updated = await prisma.projectBoqLine.update({
        where: { id: line.id },
        data: {
          executedQuantity: body.executedQuantity,
          progressCoefficient: body.progressCoefficient,
          isWorkDone: body.isWorkDone,
          quantity: body.quantity,
          unitPrice: body.unitPrice,
          description: body.description,
          lineTotal,
        },
        include: { phaseColumns: true },
      });

      return NextResponse.json(updated);
    } catch (error) {
      return apiErrorResponse(error, "Project BOQ PATCH");
    }
  },
  { schema: patchLineSchema },
);
