import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { getTaskTradeId } from "@/lib/project-task-metadata";
import { buildTaskTradeDescription, getTaskTradeNotes } from "@/lib/project-task-trade";
import type { ProjectSubDomainId } from "@/lib/project-sub-domains";
import { PROJECT_SUB_DOMAIN_BY_ID } from "@/lib/project-sub-domains";
import {
  boardPriorityToDb,
  boardStatusToDb,
} from "@/lib/tasks/board-mapping";
import {
  buildTaskKanbanMetadataJson,
  mapPrismaTaskToBoardRow,
  mergeTaskKanbanMetadata,
} from "@/lib/tasks/kanban-task-mapper";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { syncTaskToGoogleCalendarIfEligible } from "@/lib/google-calendar-sync";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("project-tasks");

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

const taskInclude = {
  project: {
    include: {
      contacts: { take: 1, orderBy: { createdAt: "asc" as const } },
    },
  },
} as const;

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id: projectId } = await segment.params;
  try {
    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const tasks = await prisma.task.findMany({
      where: { projectId, organizationId: orgId },
      include: taskInclude,
      orderBy: { createdAt: "desc" },
    });

    const mapped = tasks.map(mapPrismaTaskToBoardRow);
    return NextResponse.json({ tasks: mapped });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Project tasks GET");
  }
});

const metadataSchema = z.record(z.string(), z.unknown()).optional();

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
  dueDate: z.string().optional(),
  clientName: z.string().optional(),
  contactId: z.string().optional(),
  budget: z.number().optional(),
  metadata: metadataSchema,
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof createSchema>(
  async (_req, { orgId, userId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const tradeId = body.tradeId && PROJECT_SUB_DOMAIN_BY_ID[body.tradeId as ProjectSubDomainId]
        ? (body.tradeId as ProjectSubDomainId)
        : null;

      const dbStatus = body.status ? boardStatusToDb(body.status) ?? body.status : "TODO";
      const dbPriority = body.priority ? boardPriorityToDb(body.priority) ?? body.priority : "MEDIUM";

      const kanbanMeta = buildTaskKanbanMetadataJson({
        clientName: body.clientName,
        contactId: body.contactId,
        budget: body.budget,
      });
      let metadata: Prisma.InputJsonValue | undefined;
      if (body.metadata !== undefined) {
        metadata = {
          ...(kanbanMeta as Record<string, unknown>),
          ...body.metadata,
        } as Prisma.InputJsonValue;
      } else if (Object.keys(kanbanMeta as Record<string, unknown>).length > 0) {
        metadata = kanbanMeta;
      }

      if (body.contactId) {
        await prisma.contact.updateMany({
          where: { id: body.contactId, organizationId: orgId },
          data: { projectId },
        });
        await prisma.project.update({
          where: { id: projectId },
          data: { primaryContactId: body.contactId },
        });
      }

      if (typeof body.budget === "number") {
        await prisma.project.update({
          where: { id: projectId },
          data: { budget: body.budget },
        });
      }

      const task = await prisma.task.create({
        data: {
          title: body.title.trim(),
          projectId,
          organizationId: orgId,
          startDate: toIsoDate(body.startDate),
          endDate: toIsoDate(body.endDate),
          dueDate: toIsoDate(body.dueDate),
          progress: body.progress ?? 0,
          status: dbStatus,
          priority: dbPriority,
          dependencies: parseDependencies(
            Array.isArray(body.dependencies) ? JSON.stringify(body.dependencies) : body.dependencies,
          ),
          linkedBoqLineId: body.linkedBoqLineId ?? null,
          description: buildTaskTradeDescription(tradeId, body.description, body.linkedBoqLineId),
          ...(metadata !== undefined ? { metadata } : {}),
        },
      });

      await captureServerEvent(userId, "task_created", {
        taskId: task.id,
        organizationId: orgId,
      });

      try {
        await syncTaskToGoogleCalendarIfEligible(userId, orgId, task);
      } catch (err: unknown) {
        log.warn("calendar sync after task create failed", {
          taskId: task.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }

      return NextResponse.json({ task, success: true });
    } catch (error) {
      return apiErrorResponse(error, "Project tasks POST");
    }
  },
  { schema: createSchema },
);

const patchSchema = z
  .object({
    id: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
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
    dueDate: z.string().nullable().optional(),
    clientName: z.string().optional(),
    contactId: z.string().optional(),
    budget: z.number().optional(),
    metadata: metadataSchema,
  })
  .refine((body) => Boolean(body.id ?? body.taskId), {
    message: "חסר מזהה משימה",
    path: ["id"],
  });

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchSchema>(
  async (_req, { orgId, userId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const taskId = body.id ?? body.taskId;
      if (!taskId) {
        return NextResponse.json({ error: "חסר מזהה משימה" }, { status: 400 });
      }

      const existing = await prisma.task.findFirst({
        where: { id: taskId, projectId, organizationId: orgId },
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

      const dbStatus = body.status ? boardStatusToDb(body.status) ?? body.status : undefined;
      const dbPriority = body.priority ? boardPriorityToDb(body.priority) ?? body.priority : undefined;

      let metadataPatch: Prisma.InputJsonValue | undefined;
      if (
        body.metadata !== undefined ||
        body.clientName !== undefined ||
        body.contactId !== undefined ||
        body.budget !== undefined
      ) {
        metadataPatch = mergeTaskKanbanMetadata(existing.metadata, {
          ...(body.clientName !== undefined ? { clientName: body.clientName } : {}),
          ...(body.contactId !== undefined ? { contactId: body.contactId } : {}),
          ...(body.budget !== undefined ? { budget: body.budget } : {}),
        });
        if (body.metadata) {
          metadataPatch = {
            ...(metadataPatch as Record<string, unknown>),
            ...body.metadata,
          } as Prisma.InputJsonValue;
        }
      }

      if (body.contactId) {
        await prisma.contact.updateMany({
          where: { id: body.contactId, organizationId: orgId },
          data: { projectId },
        });
        await prisma.project.update({
          where: { id: projectId },
          data: { primaryContactId: body.contactId },
        });
      }

      if (typeof body.budget === "number") {
        await prisma.project.update({
          where: { id: projectId },
          data: { budget: body.budget },
        });
      }

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          title: body.title?.trim(),
          startDate: body.startDate === undefined ? undefined : toIsoDate(body.startDate ?? undefined),
          endDate: body.endDate === undefined ? undefined : toIsoDate(body.endDate ?? undefined),
          dueDate: body.dueDate === undefined ? undefined : toIsoDate(body.dueDate ?? undefined),
          progress: body.progress,
          status: dbStatus,
          priority: dbPriority,
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
          ...(metadataPatch !== undefined ? { metadata: metadataPatch } : {}),
        },
      });

      if (body.status) {
        await captureServerEvent(userId, "task_status_changed", {
          taskId,
          status: body.status,
          organizationId: orgId,
        });
      }

      try {
        await syncTaskToGoogleCalendarIfEligible(userId, orgId, updated);
      } catch (err: unknown) {
        log.warn("calendar sync after task update failed", {
          taskId: updated.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }

      return NextResponse.json({ task: updated, success: true });
    } catch (error) {
      return apiErrorResponse(error, "Project tasks PATCH");
    }
  },
  { schema: patchSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId, userId }, segment) => {
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

    const existing = await prisma.task.findFirst({
      where: { id: taskId, projectId, organizationId: orgId },
    });
    if (!existing) {
      return NextResponse.json({ error: "משימה לא נמצאה" }, { status: 404 });
    }

    await prisma.task.deleteMany({
      where: { id: taskId, projectId, organizationId: orgId },
    });

    try {
      await syncTaskToGoogleCalendarIfEligible(userId, orgId, {
        ...existing,
        dueDate: null,
        endDate: null,
        startDate: null,
      });
    } catch (err: unknown) {
      log.warn("calendar sync after task delete failed", {
        taskId,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    await captureServerEvent(userId, "task_deleted", {
      taskId,
      organizationId: orgId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Project tasks DELETE");
  }
});
