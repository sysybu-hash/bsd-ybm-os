import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonForbidden } from "@/lib/api-json";
import { canManageOrgUsers } from "@/lib/org-admin-auth";
import { sendRegistrationWelcomeEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  email: z.string().email(),
});

export const POST = withWorkspacesAuth(async (req, ctx, data) => {
  const actor = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true },
  });
  if (!canManageOrgUsers(ctx.role, actor?.email)) {
    return jsonForbidden("רק מנהל ארגון רשאי לשלוח מייל אימות");
  }

  const email = data.email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      organizationId: ctx.orgId,
    },
    select: { name: true, emailVerified: true },
  });

  if (!user) {
    return jsonBadRequest(
      "משתמש לא נמצא בארגון שלך. עליו להתחבר פעם אחת לפני שליחת מייל.",
      "user_not_found",
    );
  }

  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const result = await sendRegistrationWelcomeEmail(email, user.name, {
    tierLabelHe: "צוות",
    tierKey: "TEAM",
    accountActive: true,
    extraNote: "אם עדיין לא אימתת את האימייל — התחבר/י שוב עם Google באותו כתובת.",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}, { schema: bodySchema });
