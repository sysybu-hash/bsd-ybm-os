import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { getTaskTradeId } from "@/lib/project-task-metadata";
import { buildTaskTradeDescription, getTaskTradeNotes } from "@/lib/project-task-trade";
import type { ProjectSubDomainId } from "@/lib/project-sub-domains";
import { PROJECT_SUB_DOMAIN_BY_ID } from "@/lib/project-sub-domains";

export const dynamic = "force-dynamic";

function parseDependencies(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.filter((x) => typeof x === "string"));
    }
  } catch {
    /* comma-separated fallback */
  }
  const ids = trimmed
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? JSON.stringify(ids) : null;
}

function toIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const createSchema = z.object({
  title: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  dependencies: z.union([z.string(), z.array(z.string())]).optional(),
  tradeId: z.string().optional(),
  linkedBoqLineId: z.string().nullable().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof createSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const tradeId = body.tradeId && PROJECT_SUB_DOMAIN_BY_ID[body.tradeId as ProjectSubDomainId]
        ? (body.tradeId as ProjectSubDomainId)
        : null;

      const task = await prisma.task.create({
        data: {
          title: body.title.trim(),
          projectId,
          organizationId: orgId,
          startDate: toIsoDate(body.startDate),
          endDate: toIsoDate(body.endDate),
          progress: body.progress ?? 0,
          status: body.status ?? "TODO",
          priority: body.priority ?? "MEDIUM",
          dependencies: parseDependencies(
            Array.isArray(body.dependencies) ? JSON.stringify(body.dependencies) : body.dependencies,
          ),
          linkedBoqLineId: body.linkedBoqLineId ?? null,
          description: buildTaskTradeDescription(tradeId, body.description, body.linkedBoqLineId),
        },
      });

      return NextResponse.json({ task });
    } catch (error) {
      return apiErrorResponse(error, "Project tasks POST");
    }
  },
  { schema: createSchema },
);

const patchSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  dependencies: z.union([z.string(), z.array(z.string())]).optional(),
  tradeId: z.string().nullable().optional(),
  linkedBoqLineId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
});

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const existing = await prisma.task.findFirst({
        where: { id: body.id, projectId, organizationId: orgId },
      });
      if (!existing) {
        return NextResponse.json({ error: "משימה לא נמצאה" }, { status: 404 });
      }

      let description: string | null | undefined = undefined;
      const boqId =
        body.linkedBoqLineId === undefined
          ? undefined
          : body.linkedBoqLineId;
      if (body.tradeId !== undefined || body.description !== undefined || boqId !== undefined) {
        const tradeId =
          body.tradeId === null
            ? null
            : body.tradeId && PROJECT_SUB_DOMAIN_BY_ID[body.tradeId as ProjectSubDomainId]
              ? (body.tradeId as ProjectSubDomainId)
              : body.tradeId === undefined
                ? getTaskTradeId(existing.description)
                : null;
        const notes =
          body.description !== undefined ? body.description : getTaskTradeNotes(existing.description);
        const resolvedBoq =
          boqId === undefined ? (existing.linkedBoqLineId ?? null) : boqId;
        description = buildTaskTradeDescription(tradeId, notes, resolvedBoq);
      }

      const updated = await prisma.task.update({
        where: { id: body.id },
        data: {
          title: body.title?.trim(),
          startDate: body.startDate === undefined ? undefined : toIsoDate(body.startDate ?? undefined),
          endDate: body.endDate === undefined ? undefined : toIsoDate(body.endDate ?? undefined),
          progress: body.progress,
          status: body.status,
          priority: body.priority,
          linkedBoqLineId: boqId === undefined ? undefined : boqId,
          dependencies:
            body.dependencies === undefined
              ? undefined
              : parseDependencies(
                  Array.isArray(body.dependencies)
                    ? JSON.stringify(body.dependencies)
                    : body.dependencies,
                ),
          description,
        },
      });

      return NextResponse.json({ task: updated });
    } catch (error) {
      return apiErrorResponse(error, "Project tasks PATCH");
    }
  },
  { schema: patchSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId }, segment) => {
  const { id: projectId } = await segment.params;
  try {
    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const url = new URL(req.url);
    let taskId = url.searchParams.get("id");
    const clearAll = url.searchParams.get("clearAll") === "true";
    if (!taskId && !clearAll) {
      const body = (await req.json().catch(() => ({}))) as { id?: string; clearAll?: boolean };
      taskId = body.id ?? null;
      if (body.clearAll) {
        const result = await prisma.task.deleteMany({ where: { projectId, organizationId: orgId } });
        return NextResponse.json({ success: true, deleted: result.count });
      }
    }
    if (clearAll) {
      const result = await prisma.task.deleteMany({ where: { projectId, organizationId: orgId } });
      return NextResponse.json({ success: true, deleted: result.count });
    }
    if (!taskId) {
      return NextResponse.json({ error: "חסר מזהה משימה" }, { status: 400 });
    }

    const deleted = await prisma.task.deleteMany({
      where: { id: taskId, projectId, organizationId: orgId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "משימה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Project tasks DELETE");
  }
});
