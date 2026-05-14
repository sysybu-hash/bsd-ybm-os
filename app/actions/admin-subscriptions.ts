"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { AccountStatus, type SubscriptionTier, type UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateProvisionPassword } from "@/lib/password";
import { sendProvisionCredentialsEmail } from "@/app/actions/send-credentials-email";
import {
  sendAccessApprovedAdminNotify,
  sendAccessApprovedEmail,
} from "@/lib/mail";
import { isAdmin } from "@/lib/is-admin";
import {
  defaultScanBalancesForTier,
  parseSubscriptionTier,
} from "@/lib/subscription-tier-config";

/** אישור מנויים / ניהול לקוחות — רק OS Owner */
async function requireOSOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return null;
  }
  if (!isAdmin(session.user.email)) {
    return null;
  }
  return session;
}

function assertValidTier(plan: string): SubscriptionTier | null {
  const t = parseSubscriptionTier(plan);
  return t;
}

export async function approveOrganizationAction(
  organizationId: string,
  plan: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOSOwner();
  if (!session) {
    return { ok: false, error: "אין הרשאה" };
  }

  const tier = assertValidTier(plan);
  if (!tier) {
    return { ok: false, error: "רמת מנוי לא חוקית" };
  }

  const balances = defaultScanBalancesForTier(tier);
  try {
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: organizationId },
        data: {
          subscriptionStatus: "ACTIVE",
          subscriptionTier: tier,
          cheapScansRemaining: balances.cheapScansRemaining,
          premiumScansRemaining: balances.premiumScansRemaining,
          maxCompanies: balances.maxCompanies,
        },
      }),
      prisma.user.updateMany({
        where: {
          organizationId,
          accountStatus: AccountStatus.PENDING_APPROVAL,
        },
        data: { accountStatus: AccountStatus.ACTIVE },
      }),
    ]);
    revalidatePath("/app/admin");
    revalidatePath("/app/documents/erp");
    revalidatePath("/app/settings/billing");
    revalidatePath("/app/settings/overview");
    return { ok: true };
  } catch {
    return { ok: false, error: "עדכון נכשל" };
  }
}

const PROVISION_ROLES: UserRole[] = [
  "ORG_ADMIN",
  "PROJECT_MGR",
  "EMPLOYEE",
  "CLIENT",
];

export async function approvePendingRegistrationAction(
  userId: string,
  role: string,
  plan: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOSOwner();
  if (!session) return { ok: false, error: "אין הרשאה" };
  if (!userId) return { ok: false, error: "חסר מזהה משתמש" };

  const tier = assertValidTier(plan);
  if (!tier) {
    return { ok: false, error: "רמת מנוי לא חוקית" };
  }
  if (!PROVISION_ROLES.includes(role as UserRole)) {
    return { ok: false, error: "תפקיד לא חוקי" };
  }
  const nextRole = role as UserRole;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true, accountStatus: true, email: true, name: true },
  });
  if (!user?.organizationId) {
    return { ok: false, error: "משתמש/ארגון לא נמצא" };
  }
  if (isAdmin(user.email)) {
    return { ok: false, error: "לא ניתן לאשר משתמש מנהל מערכת" };
  }

  const balances = defaultScanBalancesForTier(tier);
  try {
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: user.organizationId },
        data: {
          subscriptionStatus: "ACTIVE",
          subscriptionTier: tier,
          cheapScansRemaining: balances.cheapScansRemaining,
          premiumScansRemaining: balances.premiumScansRemaining,
          maxCompanies: balances.maxCompanies,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { accountStatus: AccountStatus.ACTIVE, role: nextRole },
      }),
    ]);
    revalidatePath("/app/admin");
    revalidatePath("/app/documents/erp");
    revalidatePath("/app/settings/billing");
    revalidatePath("/app/settings/overview");

    void Promise.all([
      sendAccessApprovedEmail(user.email),
      sendAccessApprovedAdminNotify(user.email, user.name),
    ]).catch((err) => console.error("access-approved emails", err));

    return { ok: true };
  } catch {
    return { ok: false, error: "אישור הרשמה נכשל" };
  }
}

export async function provisionUserAction(formData: FormData): Promise<
  | { ok: true; password?: string; emailed: boolean }
  | { ok: false; error: string }
> {
  const session = await requireOSOwner();
  if (!session) {
    return { ok: false, error: "אין הרשאה" };
  }

  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const roleStr = String(formData.get("role") ?? "EMPLOYEE");
  const sendEmail = formData.get("sendEmail") === "on";
  const useGenerated = formData.get("useGenerated") === "on";
  const passwordManual = String(formData.get("passwordManual") ?? "").trim();

  if (!emailRaw || !organizationId) {
    return { ok: false, error: "חסר אימייל או ארגון" };
  }
  if (isAdmin(emailRaw)) {
    return { ok: false, error: "לא ניתן לספק סיסמה למנהל המערכת" };
  }

  const role = PROVISION_ROLES.includes(roleStr as UserRole) ? (roleStr as UserRole) : "EMPLOYEE";

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (!org) {
    return { ok: false, error: "ארגון לא נמצא" };
  }

  const plain = useGenerated
    ? generateProvisionPassword(14)
    : passwordManual;

  if (!plain || plain.length < 8) {
    return { ok: false, error: "סיסמה קצרה מדי או חסרה (מינימום 8 תווים) — או סמנו מחולל אוטומטי" };
  }

  const passwordHash = await hashPassword(plain);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: emailRaw, mode: "insensitive" } },
  });
  if (existing) {
    if (existing.organizationId !== organizationId) {
      return { ok: false, error: "האימייל משויך לארגון אחר" };
    }
    try {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          accountStatus: AccountStatus.ACTIVE,
          name: name ?? existing.name,
          role,
        },
      });
    } catch {
      return { ok: false, error: "עדכון סיסמה נכשל" };
    }
  } else {
    try {
      await prisma.user.create({
        data: {
          email: emailRaw,
          name,
          organizationId,
          role,
          accountStatus: AccountStatus.ACTIVE,
          passwordHash,
        },
      });
    } catch {
      return { ok: false, error: "יצירת משתמש נכשלה" };
    }
  }

  let emailed = false;
  if (sendEmail) {
    const r = await sendProvisionCredentialsEmail(emailRaw, name, plain, org.name);
    emailed = r.ok;
  }

  revalidatePath("/app/admin");
  revalidatePath("/app/settings/overview");
  return { ok: true, password: sendEmail ? undefined : plain, emailed };
}
