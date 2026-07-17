import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonUnauthorized } from "@/lib/api-json";
import { PRESENCE_ONLINE_MS } from "@/lib/admin/login-presence";

export const dynamic = "force-dynamic";

/** Heartbeat נוכחות — מעדכן lastSeenAt לכל היותר פעם ב־~45 שנ׳ */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id?.trim();
  if (!userId) return jsonUnauthorized();

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
}
