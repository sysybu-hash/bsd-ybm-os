import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (request, { orgId, userId }) => {
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitRaw) || 20, 1), 50);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { scanHistoryClearedAt: true },
  });

  const docs = await prisma.document.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      ...(user?.scanHistoryClearedAt
        ? { createdAt: { gt: user.scanHistoryClearedAt } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fileName: true,
      type: true,
      status: true,
      createdAt: true,
      aiData: true,
    },
  });

  const items = docs.map((d) => {
    const ai = d.aiData as Record<string, unknown> | null;
    const vendor = typeof ai?.vendor === "string" ? ai.vendor : null;
    const total = typeof ai?.total === "number" ? ai.total : null;
    return {
      id: d.id,
      fileName: d.fileName,
      type: d.type,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      vendor,
      total,
    };
  });

  return NextResponse.json({ items });
});

export const DELETE = withWorkspacesAuth(
  async (_req, { userId }) => {
    await prisma.user.update({
      where: { id: userId },
      data: { scanHistoryClearedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  },
  { rateLimit: { key: "scan:history:clear", limit: 10, windowMs: 60_000 } },
);
