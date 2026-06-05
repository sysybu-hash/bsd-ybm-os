import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import type { WorkspaceAuthContext } from "@/lib/api-handler";
import { canAccessMeckano, MECKANO_ACCESS_ERROR, type SessionLike } from "@/lib/meckano-access";
import { prisma } from "@/lib/prisma";

/** בונה אובייקט session ל־Meckano מתוך הקשר workspace (אחרי withWorkspacesAuth). */
export async function meckanoSessionFromWorkspace(ctx: WorkspaceAuthContext) {
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true },
  });
  return {
    user: {
      id: ctx.userId,
      organizationId: ctx.orgId,
      email: user?.email ?? null,
    },
  };
}

export type MeckanoSessionAuth =
  | { error: NextResponse }
  | { apiKey: string };

export async function requireMeckanoSession(session: SessionLike): Promise<MeckanoSessionAuth> {
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 }),
    };
  }
  if (!(await canAccessMeckano(session))) {
    return {
      error: NextResponse.json(
        { error: MECKANO_ACCESS_ERROR, code: "meckano_forbidden" },
        { status: 403 },
      ),
    };
  }
  const orgId = session.user?.organizationId;
  let apiKey = env.MECKANO_API_KEY?.trim() ?? "";
  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { meckanoApiKey: true },
    });
    if (org?.meckanoApiKey?.trim()) {
      apiKey = org.meckanoApiKey.trim();
    }
  }
  if (!apiKey) {
    return {
      error: NextResponse.json(
        { error: "Meckano API Key is not configured", code: "meckano_not_configured" },
        { status: 503 },
      ),
    };
  }
  return { apiKey };
}
