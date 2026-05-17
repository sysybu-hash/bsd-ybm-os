import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import type { WorkspaceAuthContext } from "@/lib/api-handler";
import { getDashboardStats } from "@/lib/workspace-api/dashboard-stats";
import { getProjectByName } from "@/lib/workspace-api/project-detail";
import { getUnreadNotificationsFeed } from "@/lib/workspace-api/notifications-feed";
import { confirmExpense } from "@/lib/workspace-api/confirm-expense";

export async function handleDataGet(
  req: Request,
  ctx: WorkspaceAuthContext,
): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const query = searchParams.get("query") || "";
  const { orgId, userId } = ctx;

  try {
    if (type === "dashboard") {
      return NextResponse.json(await getDashboardStats(orgId));
    }

    if (type === "project") {
      return NextResponse.json(await getProjectByName(orgId, query));
    }

    if (type === "notifications") {
      return NextResponse.json(await getUnreadNotificationsFeed(userId));
    }

    if (type === "projects") {
      const projects = await prisma.project.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true },
      });
      return NextResponse.json({ projects });
    }

    if (type === "clients" || type === "crm") {
      const clients = await prisma.contact.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json(clients || []);
    }

    return jsonNotFound("Not Found");
  } catch (err) {
    return apiErrorResponse(err, `DB GET Error [type=${type}]`);
  }
}

type DataPostBody = {
  type?: string;
  amount?: number | string;
  projectName?: string;
  vendor?: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  id?: string;
  payload?: unknown;
};

export async function handleDataPost(
  _req: Request,
  ctx: WorkspaceAuthContext,
  body: DataPostBody,
): Promise<NextResponse> {
  const { orgId, userId } = ctx;

  try {
    if (body.type === "confirm-expense") {
      const result = await confirmExpense(orgId, {
        amount: body.amount ?? 0,
        projectName: body.projectName,
        vendor: body.vendor,
      });
      if (!result.ok) {
        return jsonBadRequest(result.error);
      }
      return NextResponse.json(result);
    }

    if (body.type === "layout") {
      return NextResponse.json({ success: true });
    }

    if (body.type === "add-client") {
      const newContact = await prisma.contact.create({
        data: {
          name: String(body.name ?? ""),
          phone: body.phone || null,
          email: body.email || null,
          notes: body.company ? `חברה: ${body.company}` : null,
          organizationId: orgId,
        },
      });
      return NextResponse.json({ success: true, contact: newContact });
    }

    if (body.type === "delete-client" && body.id) {
      await prisma.contact.deleteMany({
        where: { id: body.id, organizationId: orgId },
      });
      return NextResponse.json({ success: true });
    }

    if (body.type === "mark-notification-read" && body.id) {
      await prisma.inAppNotification.updateMany({
        where: { id: body.id, userId },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    if (body.type === "project" || body.type === "cashflow") {
      return NextResponse.json({
        success: true,
        data: body.payload ?? null,
        savedAt: new Date().toISOString(),
      });
    }

    return jsonBadRequest("Invalid Type");
  } catch (err) {
    return apiErrorResponse(err, "DB POST Error");
  }
}
