import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!organization) {
      return jsonNotFound("ארגון לא נמצא");
    }

    return NextResponse.json(organization);
  } catch (error) {
    return apiErrorResponse(error, "Organization GET Error");
  }
});

export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  try {
    const body = await req.json();
    const { name, taxId, tenantSiteBrandingJson } = body;

    const existing = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!existing) {
      return jsonNotFound("ארגון לא נמצא לעדכון");
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        name,
        taxId,
        tenantSiteBrandingJson: tenantSiteBrandingJson || undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error, "Organization POST Error");
  }
});
