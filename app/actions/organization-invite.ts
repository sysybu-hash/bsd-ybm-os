"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import { sendOrganizationTeamInviteEmail } from "@/lib/mail";

const ASSIGNABLE: UserRole[] = ["EMPLOYEE", "PROJECT_MGR", "CLIENT", "ORG_ADMIN"];

function parseInviteRole(raw: string): UserRole {
  return ASSIGNABLE.includes(raw as UserRole) ? (raw as UserRole) : "EMPLOYEE";
}

/** מנהל ארגון: יוצר קישור הרשמה לארגון הקיים עם תפקיד מוגדר (לא ארגון חדש). */
export async function createOrganizationInviteAction(formData: FormData): Promise<
  { ok: true; registerUrl: string } | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.organizationId) {
    return { ok: false, error: "נדרשת התחברות וארגון" };
  }
  const roleStr = session.user.role ?? "";
  if (roleStr !== "ORG_ADMIN" && roleStr !== "SUPER_ADMIN") {
    return { ok: false, error: "רק מנהל ארגון רשאי לשלוח הזמנת צוות" };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = parseInviteRole(String(formData.get("role") ?? "EMPLOYEE"));
  const daysRaw = Number(formData.get("validDays") ?? 14);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? daysRaw : 14;

  if (!email.includes("@")) {
    return { ok: false, error: "אימייל לא תקין" };
  }

  const orgId = session.user.organizationId;
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  await prisma.organizationInvite.deleteMany({
    where: { organizationId: orgId, email, usedAt: null },
  });

  await prisma.organizationInvite.create({
    data: {
      token,
      email,
      organizationId: orgId,
      role,
      expiresAt,
      createdByEmail: session.user.email?.trim().toLowerCase() ?? null,
    },
  });

  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://bsd-ybm.co.il";
  const registerUrl = `${base}/register?orgInvite=${encodeURIComponent(token)}`;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  const orgName = org?.name ?? "הארגון";

  const mail = await sendOrganizationTeamInviteEmail(email, {
    orgName,
    registerUrl,
    roleLabel: roleLabelHe(role),
    expiresNote: `הקישור תקף כ־${days} ימים. יש להירשם עם אותו אימייל.`,
  });
  if (!mail.ok) {
    await prisma.organizationInvite.deleteMany({ where: { token } });
    return { ok: false, error: mail.error };
  }

revalidatePath("/app/settings");
  revalidatePath("/app/settings");
  return { ok: true, registerUrl };
}

function roleLabelHe(r: UserRole): string {
  switch (r) {
    case "ORG_ADMIN":
      return "מנהל ארגון";
    case "PROJECT_MGR":
      return "מנהל פרויקטים";
    case "CLIENT":
      return "לקוח / צופה";
    default:
      return "עובד / צוות";
  }
}
