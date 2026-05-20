import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import {
  resolvePrimaryContactId,
  syncProjectCrmContact,
} from "@/lib/workspace-api/project-crm-sync";
import { requireProjectForOrg } from "@/lib/projects/project-access";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id } = await segment.params;
  try {
    const gate = await requireProjectForOrg(id, orgId);
    if (!gate.ok) return gate.response;

    const project = await prisma.project.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        name: true,
        status: true,
        budget: true,
        isActive: true,
        primaryContactId: true,
        autoSyncCrm: true,
        primaryContact: { select: { id: true, name: true } },
      },
    });
    if (!project) return jsonNotFound("הפרויקט לא נמצא");
    return NextResponse.json(project);
  } catch (error) {
    return apiErrorResponse(error, "Project GET");
  }
});

const patchSchema = z.object({
  status: z.string().min(1).optional(),
  budget: z.number().nonnegative().optional(),
  primaryContactId: z.string().nullable().optional(),
  autoSyncCrm: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const existing = await prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
      });
      if (!existing) return jsonNotFound("הפרויקט לא נמצא");

      const autoSyncCrm = body.autoSyncCrm ?? existing.autoSyncCrm;
      const resolvedPrimary = await resolvePrimaryContactId(
        projectId,
        orgId,
        body.primaryContactId !== undefined ? body.primaryContactId : existing.primaryContactId,
        autoSyncCrm,
      );

      const project = await prisma.project.update({
        where: { id: projectId },
        data: {
          status: body.status,
          budget: body.budget,
          isActive: body.isActive,
          autoSyncCrm,
          primaryContactId: resolvedPrimary ?? null,
        },
        select: {
          id: true,
          name: true,
          status: true,
          budget: true,
          isActive: true,
          primaryContactId: true,
          autoSyncCrm: true,
          primaryContact: { select: { id: true, name: true } },
        },
      });

      await syncProjectCrmContact(
        projectId,
        orgId,
        project.primaryContactId,
        project.autoSyncCrm,
      );

      return NextResponse.json(project);
    } catch (error) {
      return apiErrorResponse(error, "Project PATCH");
    }
  },
  { schema: patchSchema },
);
