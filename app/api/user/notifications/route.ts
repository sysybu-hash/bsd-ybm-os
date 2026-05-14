import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return jsonUnauthorized();
  }

  const items = await prisma.inAppNotification.findMany({
    where: { userId: session.user.id },
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
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return jsonUnauthorized();
  }

  const body = (await req.json().catch(() => ({}))) as {
    all?: boolean;
    ids?: string[];
  };

  if (body.all) {
    await prisma.inAppNotification.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) {
    return jsonBadRequest("חסר ids או all", "missing_ids_or_all");
  }

  await prisma.inAppNotification.updateMany({
    where: { userId: session.user.id, id: { in: ids } },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
