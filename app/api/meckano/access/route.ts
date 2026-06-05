import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { canAccessMeckano, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { meckanoSessionFromWorkspace } from "@/lib/meckano-route-auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (_req, ctx) => {
  const sessionLike = await meckanoSessionFromWorkspace(ctx);
  const allowed = await canAccessMeckano(sessionLike);
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: {
      meckanoAutoSyncEnabled: true,
      meckanoLastSyncAt: true,
      meckanoApiKey: true,
    },
  });
  const configured = Boolean(org?.meckanoApiKey?.trim() || env.MECKANO_API_KEY?.trim());

  return NextResponse.json({
    allowed,
    configured,
    message: allowed ? null : MECKANO_ACCESS_ERROR,
    autoSyncEnabled: org?.meckanoAutoSyncEnabled ?? true,
    lastSyncAt: org?.meckanoLastSyncAt?.toISOString() ?? null,
  });
});
