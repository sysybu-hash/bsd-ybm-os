import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { assignContactProject } from "@/lib/workspace-api/project-crm-sync";

const patchContactSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
  projectId: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});

const contactSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  value: true,
  notes: true,
  tags: true,
  createdAt: true,
  project: { select: { id: true, name: true } },
  issuedDocuments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      type: true,
      number: true,
      clientName: true,
      amount: true,
      vat: true,
      total: true,
      status: true,
      date: true,
      dueDate: true,
      items: true,
      createdAt: true,
    },
  },
};

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id } = await segment.params;

  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: orgId },
    select: contactSelect,
  });

  if (!contact) return jsonNotFound("לא נמצא");

  const totalBilled = contact.issuedDocuments.reduce((s, d) => s + d.total, 0);
  const totalPaid = contact.issuedDocuments
    .filter((d) => d.status === "PAID")
    .reduce((s, d) => s + d.total, 0);

  return NextResponse.json({
    contact: {
      ...contact,
      createdAt: contact.createdAt.toISOString(),
      erp: {
        totalBilled,
        totalPaid,
        totalPending: totalBilled - totalPaid,
        invoiceCount: contact.issuedDocuments.length,
      },
    },
  });
});

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchContactSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id } = await segment.params;
    try {
      const existing = await prisma.contact.findFirst({
        where: { id, organizationId: orgId },
        select: { id: true },
      });
      if (!existing) return jsonNotFound("לא נמצא");

      if (body.projectId !== undefined) {
        await assignContactProject(id, body.projectId, orgId);
      }

      if (
        body.name !== undefined ||
        body.email !== undefined ||
        body.phone !== undefined ||
        body.notes !== undefined ||
        body.status !== undefined ||
        body.tags !== undefined
      ) {
        await prisma.contact.updateMany({
          where: { id, organizationId: orgId },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.email !== undefined ? { email: body.email } : {}),
            ...(body.phone !== undefined ? { phone: body.phone } : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
            ...(body.status !== undefined ? { status: body.status.toUpperCase() } : {}),
            ...(body.tags !== undefined ? { tags: body.tags } : {}),
          },
        });
      }

      const contact = await prisma.contact.findFirst({
        where: { id, organizationId: orgId },
        select: contactSelect,
      });
      return NextResponse.json({ success: true, contact });
    } catch (err) {
      return apiErrorResponse(err, "CRM contact update");
    }
  },
  { schema: patchContactSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id } = await segment.params;
  const deleted = await prisma.contact.deleteMany({
    where: { id, organizationId: orgId },
  });
  if (deleted.count === 0) return jsonNotFound("לא נמצא");
  return NextResponse.json({ success: true });
});
