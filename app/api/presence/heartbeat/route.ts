import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { PRESENCE_ONLINE_MS } from "@/lib/admin/login-presence";

export const dynamic = "force-dynamic";

/** Heartbeat נוכחות — מעדכן lastSeenAt לכל היותר פעם ב־~45 שנ׳ */
export const POST = withWorkspacesAuth(async (_req, { userId }) => {
  const now = new Date();
  const minGapMs = Math.floor(PRESENCE_ONLINE_MS / 4);

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSeenAt: true },
  });
  if (
    existing?.lastSeenAt &&
    now.getTime() - existing.lastSeenAt.getTime() < minGapMs
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: now },
  });

  return NextResponse.json({ ok: true });
});
