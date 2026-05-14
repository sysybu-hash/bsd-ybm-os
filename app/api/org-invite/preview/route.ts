import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonBadRequest, jsonGone, jsonNotFound } from "@/lib/api-json";

/** תצוגה בלבד לטופס הרשמה — ללא מידע רגיש מעבר לשם הארגון */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") ?? "").trim();
  if (!token) {
    return jsonBadRequest("חסר טוקן", "missing_token");
  }

  const inv = await prisma.organizationInvite.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      usedAt: true,
      organization: { select: { name: true } },
    },
  });

  if (!inv) {
    return jsonNotFound("הזמנה לא נמצאה");
  }
  if (inv.usedAt) {
    return jsonGone("ההזמנה כבר נוצלה", "invite_used");
  }
  if (inv.expiresAt.getTime() < Date.now()) {
    return jsonGone("תוקף ההזמנה פג", "invite_expired");
  }

  return NextResponse.json({
    orgName: inv.organization.name,
    role: inv.role,
    emailHint: inv.email,
  });
}
