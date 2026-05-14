import { AccountStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

const TITLE_MAX = 160;
const BODY_MAX = 4000;
const CHUNK = 400;

export const POST = withOSAdmin(async (req) => {
  const raw = (await req.json().catch(() => null)) as { title?: unknown; body?: unknown } | null;
  const title = typeof raw?.title === "string" ? raw.title.trim() : "";
  const body = typeof raw?.body === "string" ? raw.body.trim() : "";

  if (!title || !body) {
    return jsonBadRequest("חובה למלא כותרת ותוכן.", "missing_title_or_body");
  }
  if (title.length > TITLE_MAX || body.length > BODY_MAX) {
    return jsonBadRequest("הטקסט ארוך מדי.", "text_too_long");
  }

  const users = await prisma.user.findMany({
    where: { accountStatus: AccountStatus.ACTIVE },
    select: { id: true },
  });
  if (users.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  for (let i = 0; i < users.length; i += CHUNK) {
    const slice = users.slice(i, i + CHUNK);
    await prisma.inAppNotification.createMany({
      data: slice.map((u) => ({
        userId: u.id,
        title,
        body,
      })),
    });
  }

  return NextResponse.json({ ok: true, count: users.length });
});
