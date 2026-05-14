import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized, jsonNotFound, jsonServerError } from "@/lib/api-json";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return jsonUnauthorized();
    }

    const organizationId = session.user.organizationId;
    
    let organization;
    if (organizationId) {
      organization = await prisma.organization.findUnique({
        where: { id: organizationId }
      });
    } else {
      // Fallback to first organization if user has no org assigned (for dev/demo)
      organization = await prisma.organization.findFirst();
    }

    if (!organization) {
      return jsonNotFound("ארגון לא נמצא");
    }

    return NextResponse.json(organization);
  } catch (error) {
    console.error("Organization GET Error:", error);
    return jsonServerError();
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return jsonUnauthorized();
    }

    const body = await req.json();
    const { name, taxId, tenantSiteBrandingJson } = body;

    const organizationId = session.user.organizationId;
    
    let targetId = organizationId;
    if (!targetId) {
      const firstOrg = await prisma.organization.findFirst();
      if (firstOrg) targetId = firstOrg.id;
    }

    if (!targetId) {
      return jsonNotFound("ארגון לא נמצא לעדכון");
    }

    const updated = await prisma.organization.update({
      where: { id: targetId },
      data: {
        name,
        taxId,
        tenantSiteBrandingJson: tenantSiteBrandingJson || undefined,
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Organization POST Error:", error);
    return jsonServerError();
  }
}
