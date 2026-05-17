import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { canAccessMeckano, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { meckanoSessionFromWorkspace } from "@/lib/meckano-route-auth";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (_req, ctx) => {
  const sessionLike = await meckanoSessionFromWorkspace(ctx);
  const allowed = await canAccessMeckano(sessionLike);
  const configured = Boolean(process.env.MECKANO_API_KEY?.trim());
  return NextResponse.json({
    allowed,
    configured,
    message: allowed ? null : MECKANO_ACCESS_ERROR,
  });
});
