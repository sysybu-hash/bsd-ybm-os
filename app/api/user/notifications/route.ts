import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

export const GET = withWorkspacesAuth(async (_req, { userId }) => {
  const items = await prisma.inAppNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, title: true, body: true, read: true, createdAt: true },
  });

  return NextResponse.json({
    notifications: items.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});

export const POST = withWorkspacesAuth(async (req, { userId }) => {
  const body = (await req.json().catch(() => ({}))) as {
    all?: boolean;
    ids?: string[];
  };

  if (body.all) {
    await prisma.inAppNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) {
    return jsonBadRequest("חסר ids או all", "missing_ids_or_all");
  }

  await prisma.inAppNotification.updateMany({
    where: { userId, id: { in: ids } },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
});
