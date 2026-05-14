import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonForbidden, jsonUnauthorized } from "@/lib/api-json";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { prisma } from "@/lib/prisma";

// GET /api/meckano/zones — list all zones for the org
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return jsonUnauthorized();
  const organizationId = await getAuthorizedMeckanoOrganizationId(session);
  if (!organizationId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const zones = await prisma.meckanoZone.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ status: true, data: zones });
}

// POST /api/meckano/zones — create a new zone
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return jsonUnauthorized();
  const organizationId = await getAuthorizedMeckanoOrganizationId(session);
  if (!organizationId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const body = await req.json() as { name?: string; address?: string; description?: string; lat?: number; lng?: number; radius?: number };
  const { name, address, description, lat, lng, radius } = body;
  if (!name || !address)
    return jsonBadRequest("שם וכתובת הם שדות חובה", "missing_zone_fields");

  const zone = await prisma.meckanoZone.create({
    data: {
      organizationId,
      name,
      address,
      description: description ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      radius: radius ?? 150,
    },
  });
  return NextResponse.json({ status: true, data: zone }, { status: 201 });
}
