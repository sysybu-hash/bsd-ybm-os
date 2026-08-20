import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { scrubWorkspaceLayout } from "@/lib/workspace/user-workspace-layout";
import { prisma } from "@/lib/prisma";

export const GET = withWorkspacesAuth(async (_req, { userId }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { workspaceLayoutJson: true },
  });

  const widgets = scrubWorkspaceLayout(user?.workspaceLayoutJson ?? null);
  return NextResponse.json({ widgets });
});

export const PATCH = withWorkspacesAuth(
  async (req, { userId }) => {
    const body = (await req.json().catch(() => null)) as { widgets?: unknown } | null;
    if (!body || !Array.isArray(body.widgets)) {
      return jsonBadRequest("חסר widgets", "missing_widgets");
    }

    const widgets = scrubWorkspaceLayout(body.widgets);
    await prisma.user.update({
      where: { id: userId },
      data: { workspaceLayoutJson: widgets as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ ok: true, widgets });
  },
  { rateLimit: { key: "user:workspace-layout", limit: 40, windowMs: 60_000 } },
);
