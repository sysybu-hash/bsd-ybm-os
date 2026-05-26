import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import {
  mergeLauncherConfig,
  resolveStoredLauncherConfig,
  scrubLauncherConfig,
  shouldUsePlatformLauncherDefault,
} from "@/lib/launcher/user-launcher-config";
import { prisma } from "@/lib/prisma";

export const GET = withWorkspacesAuth(async (_req, { userId, orgId }) => {
  const [user, org] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { launcherConfigJson: true },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { industry: true },
    }),
  ]);

  const industry = org?.industry ?? null;
  const stored = user?.launcherConfigJson ?? null;
  if (shouldUsePlatformLauncherDefault(stored)) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({
    config: resolveStoredLauncherConfig(stored, industry),
  });
});

export const PATCH = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const body = (await req.json().catch(() => null)) as { config?: unknown } | null;
  if (!body?.config || typeof body.config !== "object") {
    return jsonBadRequest("חסר config", "missing_config");
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { industry: true },
  });
  const industry = org?.industry ?? null;
  const merged = scrubLauncherConfig(mergeLauncherConfig(body.config, industry), industry);
  await prisma.user.update({
    where: { id: userId },
    data: { launcherConfigJson: merged },
  });

  return NextResponse.json({ ok: true, config: merged });
});
