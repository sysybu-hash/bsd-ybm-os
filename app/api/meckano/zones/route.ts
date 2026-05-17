import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonForbidden } from "@/lib/api-json";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { meckanoSessionFromWorkspace } from "@/lib/meckano-route-auth";
import { prisma } from "@/lib/prisma";

export const GET = withWorkspacesAuth(async (_req, ctx) => {
  const sessionLike = await meckanoSessionFromWorkspace(ctx);
  const organizationId = await getAuthorizedMeckanoOrganizationId(sessionLike);
  if (!organizationId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const zones = await prisma.meckanoZone.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ status: true, data: zones });
});

export const POST = withWorkspacesAuth(async (req, ctx) => {
  const sessionLike = await meckanoSessionFromWorkspace(ctx);
  const organizationId = await getAuthorizedMeckanoOrganizationId(sessionLike);
  if (!organizationId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const body = (await req.json()) as {
    name?: string;
    address?: string;
    description?: string;
    lat?: number;
    lng?: number;
    radius?: number;
  };
  const { name, address, description, lat, lng, radius } = body;
  if (!name || !address) {
    return jsonBadRequest("שם וכתובת הם שדות חובה", "missing_zone_fields");
  }

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
});
