import { randomUUID } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  decodePlannerSummary,
  encodePlannerSummary,
  LOCAL_PLANNER_CALENDAR_ID,
  type PlannerKind,
} from "@/lib/planner/meta";

export const dynamic = "force-dynamic";

const kindSchema = z.enum(["meeting", "task", "reminder", "event"]);

const createSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
  allDay: z.boolean().optional(),
  kind: kindSchema.optional().default("event"),
  reminderMinutes: z.number().int().min(0).max(1440).optional(),
});

const updateSchema = z.object({
  summary: z.string().trim().min(1).max(500).optional(),
  start: z.string().trim().min(1).optional(),
  end: z.string().trim().min(1).optional(),
  allDay: z.boolean().optional(),
  kind: kindSchema.optional(),
  reminderMinutes: z.number().int().min(0).max(1440).nullable().optional(),
});

function parseRange(req: Request): { from: Date; to: Date } {
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (fromRaw && toRaw) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return { from, to };
    }
  }
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 2);
  return { from, to };
}

function mapRow(row: {
  id: string;
  summary: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
}) {
  const decoded = decodePlannerSummary(row.summary);
  return {
    id: row.id,
    summary: decoded.title,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    allDay: row.allDay,
    kind: decoded.kind as PlannerKind,
    reminderMinutes: decoded.reminderMinutes,
    editable: true,
    source: "planner" as const,
  };
}

export const GET = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "planner:get", 60, 60_000);
  if (limited) return limited;

  const { from, to } = parseRange(req);

  const rows = await prisma.googleCalendarEventLink.findMany({
    where: {
      userId,
      organizationId: orgId,
      googleCalendarId: LOCAL_PLANNER_CALENDAR_ID,
      startAt: { lte: to },
      endAt: { gte: from },
    },
    select: { id: true, summary: true, startAt: true, endAt: true, allDay: true },
    take: 300,
    orderBy: { startAt: "asc" },
  });

  return NextResponse.json({
    events: rows.map(mapRow),
  });
});

export const POST = withWorkspacesAuth(
  async (req, { userId, orgId }, data) => {
    const limited = await applyRateLimit(req as NextRequest, "planner:post", 30, 60_000);
    if (limited) return limited;

    const body = data as z.infer<typeof createSchema>;
    const startAt = new Date(body.start);
    const endAt = new Date(body.end);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt < startAt) {
      return jsonBadRequest("טווח תאריכים לא תקין", "invalid_range");
    }

    const kind = body.kind ?? "event";
    const reminderMinutes =
      body.reminderMinutes ?? (kind === "reminder" ? 15 : undefined);
    const summary = encodePlannerSummary(body.summary, kind, reminderMinutes ?? null);

    const row = await prisma.googleCalendarEventLink.create({
      data: {
        userId,
        organizationId: orgId,
        googleCalendarId: LOCAL_PLANNER_CALENDAR_ID,
        googleEventId: `local-${randomUUID()}`,
        entityType: "STANDALONE",
        summary,
        startAt,
        endAt,
        allDay: Boolean(body.allDay),
        lastSyncedFrom: "LOCAL",
        pushNotifiedAt: null,
      },
    });

    return NextResponse.json({ ok: true, event: mapRow(row) });
  },
  { schema: createSchema },
);

export const PATCH = withWorkspacesAuth(
  async (req, { userId, orgId }, data) => {
    const limited = await applyRateLimit(req as NextRequest, "planner:patch", 30, 60_000);
    if (limited) return limited;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonBadRequest("חסר מזהה", "missing_id");

    const existing = await prisma.googleCalendarEventLink.findFirst({
      where: {
        id,
        userId,
        organizationId: orgId,
        googleCalendarId: LOCAL_PLANNER_CALENDAR_ID,
      },
    });
    if (!existing) return jsonNotFound("פריט לא נמצא");

    const body = data as z.infer<typeof updateSchema>;
    const decoded = decodePlannerSummary(existing.summary);
    const kind = body.kind ?? decoded.kind;
    const title = body.summary ?? decoded.title;
    const reminderMinutes =
      body.reminderMinutes !== undefined
        ? body.reminderMinutes
        : decoded.reminderMinutes;

    const startAt = body.start ? new Date(body.start) : existing.startAt;
    const endAt = body.end ? new Date(body.end) : existing.endAt;
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt < startAt) {
      return jsonBadRequest("טווח תאריכים לא תקין", "invalid_range");
    }

    const row = await prisma.googleCalendarEventLink.update({
      where: { id: existing.id },
      data: {
        summary: encodePlannerSummary(title, kind, reminderMinutes),
        startAt,
        endAt,
        allDay: body.allDay ?? existing.allDay,
        pushNotifiedAt: null,
      },
    });

    return NextResponse.json({ ok: true, event: mapRow(row) });
  },
  { schema: updateSchema },
);

export const DELETE = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "planner:delete", 30, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonBadRequest("חסר מזהה", "missing_id");

  const existing = await prisma.googleCalendarEventLink.findFirst({
    where: {
      id,
      userId,
      organizationId: orgId,
      googleCalendarId: LOCAL_PLANNER_CALENDAR_ID,
    },
    select: { id: true },
  });
  if (!existing) return jsonNotFound("פריט לא נמצא");

  await prisma.googleCalendarEventLink.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
});
