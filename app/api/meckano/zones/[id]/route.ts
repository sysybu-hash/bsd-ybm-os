import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonForbidden, jsonNotFound, jsonUnauthorized } from "@/lib/api-json";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { prisma } from "@/lib/prisma";

// PUT /api/meckano/zones/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return jsonUnauthorized();
  const organizationId = await getAuthorizedMeckanoOrganizationId(session);
  if (!organizationId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const { id } = await params;
  const body = await req.json() as {
    name?: string; address?: string; description?: string;
    lat?: number; lng?: number; radius?: number; isActive?: boolean;
    managerName?: string; startDate?: string | null; endDate?: string | null;
    budgetHours?: number | null; hourlyRate?: number | null; projectNotes?: string | null;
    assignedEmployeeIds?: number[];
  };

  const existing = await prisma.meckanoZone.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== organizationId)
    return jsonNotFound("לא נמצא");

  const zone = await prisma.meckanoZone.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      address: body.address ?? existing.address,
      description: body.description !== undefined ? body.description : existing.description,
      lat: body.lat !== undefined ? body.lat : existing.lat,
      lng: body.lng !== undefined ? body.lng : existing.lng,
      radius: body.radius ?? existing.radius,
      isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
      managerName: body.managerName !== undefined ? body.managerName : existing.managerName,
      startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : existing.startDate,
      endDate: body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : existing.endDate,
      budgetHours: body.budgetHours !== undefined ? body.budgetHours : existing.budgetHours,
      hourlyRate: body.hourlyRate !== undefined ? body.hourlyRate : existing.hourlyRate,
      projectNotes: body.projectNotes !== undefined ? body.projectNotes : existing.projectNotes,
      assignedEmployeeIds: body.assignedEmployeeIds !== undefined ? body.assignedEmployeeIds : existing.assignedEmployeeIds,
    },
  });
  return NextResponse.json({ status: true, data: zone });
}

// DELETE /api/meckano/zones/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return jsonUnauthorized();
  const organizationId = await getAuthorizedMeckanoOrganizationId(session);
  if (!organizationId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const { id } = await params;
  const existing = await prisma.meckanoZone.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== organizationId)
    return jsonNotFound("לא נמצא");

  await prisma.meckanoZone.delete({ where: { id } });
  return NextResponse.json({ status: true });
}
