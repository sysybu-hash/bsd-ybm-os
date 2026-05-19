import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonForbidden } from "@/lib/api-json";
import { canManageOrgUsers } from "@/lib/org-admin-auth";
import { prisma } from "@/lib/prisma";

export const GET = withWorkspacesAuth(async (req, ctx) => {
  const actor = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true },
  });
  if (!canManageOrgUsers(ctx.role, actor?.email)) {
    return jsonForbidden("רק מנהל ארגון רשאי לבדוק אימות אימייל");
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return jsonBadRequest("חסר פרמטר email.", "missing_email");
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { emailVerified: true },
  });

  return NextResponse.json({ isVerified: Boolean(user?.emailVerified) });
});
