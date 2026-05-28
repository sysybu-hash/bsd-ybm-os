import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  jsonBadRequest,
  jsonConflict,
  jsonServerError,
} from "@/lib/api-json";
import { AccountStatus, CustomerType } from "@prisma/client";
import { trialEndsAtFromNow } from "@/lib/trial";
import {
  sendAccessApprovedEmail,
  sendNewRegistrationPendingAdminEmail,
  sendRegistrationWelcomeEmail,
} from "@/lib/mail";
import { createLogger } from "@/lib/logger";

const log = createLogger("register");
import {
  generateProvisionPassword,
  hashPassword,
  validatePasswordStrength,
} from "@/lib/password";
import { defaultScanBalancesForTier, tierLabelHe } from "@/lib/subscription-tier-config";
import { normalizeBusinessLine } from "@/lib/business-lines";
import { normalizeConstructionTrade } from "@/lib/construction-trades";
import { normalizeIndustryType } from "@/lib/professions/config";
import {
  getDefaultConstructionTradeForRegistration,
  getDefaultIndustryForRegistration,
  getPlatformConfig,
  isRegistrationOpen,
} from "@/lib/platform-settings";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function resolveRegistrationPassword(
  bodyPassword: unknown,
): Promise<
  | { ok: true; passwordHash: string; plainForEmail: string | null }
  | { ok: false; response: NextResponse }
> {
  const raw = typeof bodyPassword === "string" ? bodyPassword.trim() : "";
  if (raw) {
    const strength = validatePasswordStrength(raw);
    if (!strength.ok) {
      return {
        ok: false,
        response: jsonBadRequest(strength.message, "weak_password"),
      };
    }
    return {
      ok: true,
      passwordHash: await hashPassword(raw),
      plainForEmail: null,
    };
  }
  const plain = generateProvisionPassword();
  return {
    ok: true,
    passwordHash: await hashPassword(plain),
    plainForEmail: plain,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      organizationName?: string;
      orgType?: string;
      industry?: string;
      constructionTrade?: string;
      inviteToken?: string;
      orgInviteToken?: string;
      plan?: string;
      password?: string;
    };

    const emailRaw = String(body.email ?? "").trim();
    const name = String(body.name ?? "").trim() || null;
    const organizationName = String(body.organizationName ?? "").trim();
    const typeRaw = String(body.orgType ?? "COMPANY").toUpperCase();
    const industry = normalizeIndustryType(
      body.industry ?? (await getDefaultIndustryForRegistration()),
    );
    const constructionTrade =
      industry === "COMPANY_MGMT"
        ? body.constructionTrade
          ? normalizeBusinessLine(body.constructionTrade)
          : "GENERAL_BUSINESS"
        : body.constructionTrade
          ? normalizeConstructionTrade(body.constructionTrade)
          : await getDefaultConstructionTradeForRegistration();
    const inviteToken = String(body.inviteToken ?? "").trim();
    const orgInviteToken = String(body.orgInviteToken ?? "").trim();

    if (!EMAIL_RE.test(emailRaw)) {
      return jsonBadRequest("אימייל לא תקין", "invalid_email");
    }

    const normalized = emailRaw.toLowerCase();

    const pwdRes = await resolveRegistrationPassword(body.password);
    if (!pwdRes.ok) return pwdRes.response;
    const { passwordHash, plainForEmail } = pwdRes;

    if (!orgInviteToken && !inviteToken) {
      const open = await isRegistrationOpen();
      if (!open) {
        const cfg = await getPlatformConfig();
        const msg = cfg.maintenanceMode
          ? cfg.maintenanceMessage.trim() || "המערכת בתחזוקה. נסו שוב מאוחר יותר."
          : "הרשמה חדשה סגורה כרגע. פנו למנהל המערכת.";
        return jsonBadRequest(msg, "registration_closed");
      }
    }

    /** הזמנה לצוות — הצטרפות לארגון קיים עם תפקיד; לא נוצר ארגון חדש */
    if (orgInviteToken) {
      const inv = await prisma.organizationInvite.findUnique({
        where: { token: orgInviteToken },
      });
      if (!inv) {
        return jsonBadRequest("קישור הזמנה לא תקף", "invalid_org_invite");
      }
      if (inv.usedAt) {
        return jsonConflict("ההזמנה כבר נוצלה", "invite_used");
      }
      if (inv.expiresAt.getTime() < Date.now()) {
        return jsonBadRequest("תוקף ההזמנה פג", "invite_expired");
      }
      if (inv.email.toLowerCase() !== normalized) {
        return jsonBadRequest(
          "יש להירשם עם אותו אימייל שאליו נשלחה ההזמנה",
          "invite_email_mismatch",
        );
      }

      const existing = await prisma.user.findFirst({
        where: { email: { equals: normalized, mode: "insensitive" } },
      });

      if (existing?.organizationId && existing.organizationId !== inv.organizationId) {
        return jsonConflict(
          "האימייל כבר משויך לארגון אחר. יש לפנות למנהל או להשתמש באימייל אחר.",
          "email_org_mismatch",
        );
      }

      try {
        await prisma.$transaction(async (tx) => {
          if (existing) {
            await tx.user.update({
              where: { id: existing.id },
              data: {
                organizationId: inv.organizationId,
                role: inv.role,
                accountStatus: AccountStatus.ACTIVE,
                passwordHash,
                ...(name ? { name } : {}),
              },
            });
          } else {
            await tx.user.create({
              data: {
                email: normalized,
                name,
                organizationId: inv.organizationId,
                role: inv.role,
                accountStatus: AccountStatus.ACTIVE,
                passwordHash,
              },
            });
          }
          await tx.organizationInvite.update({
            where: { id: inv.id },
            data: { usedAt: new Date() },
          });
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("register orgInvite failed", { error: msg });
        return jsonServerError("שגיאה בשמירת המשתמש");
      }

      const joinedOrg = await prisma.organization.findUnique({
        where: { id: inv.organizationId },
        select: { subscriptionTier: true },
      });
      const tier = joinedOrg?.subscriptionTier ?? "FREE";
      void sendAccessApprovedEmail(normalized, name, {
        variant: "registration_active",
        temporaryPassword: plainForEmail ?? undefined,
        tierLabelHe: tierLabelHe(tier),
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("sendAccessApprovedEmail (orgInvite)", { error: msg });
      });

      return NextResponse.json({
        ok: true,
        message: plainForEmail
          ? "ההרשמה הושלמה. פרטי הסיסמה נשלחו לאימייל — התחברו בדף הכניסה."
          : "ההרשמה הושלמה. התחברו בדף הכניסה עם האימייל והסיסמה שבחרתם.",
      });
    }

    if (organizationName.length < 2) {
      return jsonBadRequest("נא למלא שם ארגון או עסק", "missing_org_name");
    }

    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
    });
    if (existingUser) {
      return jsonConflict("כתובת האימייל כבר רשומה במערכת", "email_taken");
    }

    const orgType = Object.values(CustomerType).includes(typeRaw as CustomerType)
      ? (typeRaw as CustomerType)
      : CustomerType.COMPANY;

    /** הזמנת מנוי (Executive) — נפתח ארגון חדש; הנרשם הוא מנהל הארגון */
    if (inviteToken) {
      const inv = await prisma.subscriptionInvitation.findUnique({
        where: { token: inviteToken },
      });
      if (!inv) {
        return jsonBadRequest("קישור הזמנה לא תקף", "invalid_sub_invite");
      }
      if (inv.usedAt) {
        return jsonConflict("ההזמנה כבר נוצלה", "sub_invite_used");
      }
      if (inv.expiresAt.getTime() < Date.now()) {
        return jsonBadRequest("תוקף ההזמנה פג", "sub_invite_expired");
      }
      if (inv.email.toLowerCase() !== normalized) {
        return jsonBadRequest(
          "יש להירשם עם אותו אימייל שאליו נשלחה ההזמנה",
          "sub_invite_email_mismatch",
        );
      }

      const balances = defaultScanBalancesForTier(inv.subscriptionTier);

      await prisma.$transaction(async (tx) => {
        await tx.organization.create({
          data: {
            name: organizationName,
            type: orgType,
            industry,
            constructionTrade,
            subscriptionTier: inv.subscriptionTier,
            subscriptionStatus: "ACTIVE",
            cheapScansRemaining: balances.cheapScansRemaining,
            premiumScansRemaining: balances.premiumScansRemaining,
            maxCompanies: balances.maxCompanies,
            trialEndsAt:
              inv.subscriptionTier === "FREE" ? trialEndsAtFromNow() : null,
            users: {
              create: {
                email: normalized,
                name,
                role: "ORG_ADMIN",
                accountStatus: AccountStatus.ACTIVE,
                passwordHash,
              },
            },
          },
        });
        await tx.subscriptionInvitation.update({
          where: { id: inv.id },
          data: { usedAt: new Date() },
        });
      });

      void sendAccessApprovedEmail(normalized, name, {
        variant: "registration_active",
        temporaryPassword: plainForEmail ?? undefined,
        tierLabelHe: tierLabelHe(inv.subscriptionTier),
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("sendAccessApprovedEmail (invite)", { error: msg });
      });

      return NextResponse.json({
        ok: true,
        message: plainForEmail
          ? "ההרשמה הושלמה. פרטי הסיסמה נשלחו לאימייל."
          : "ההרשמה הושלמה — התחברו במייל והסיסמה שבחרתם.",
      });
    }

    const planRaw = String(body.plan ?? "").toUpperCase();
    const isDirectPlan = !!body.plan;

    // Mapping plan string to SubscriptionTier enum
    const tier = ["FREE", "HOUSEHOLD", "DEALER", "COMPANY", "CORPORATE"].includes(planRaw)
       ? (planRaw as import("@prisma/client").SubscriptionTier)
       : "FREE";

    // Only general signup (no plan, no invite) goes to PENDING_APPROVAL
    const shouldApprove = isDirectPlan || !!inviteToken || !!orgInviteToken;
    const initialStatus = shouldApprove ? AccountStatus.ACTIVE : AccountStatus.PENDING_APPROVAL;
    const initialSubStatus = shouldApprove ? "ACTIVE" : "PENDING_APPROVAL";

    const balances = defaultScanBalancesForTier(tier);

    await prisma.organization.create({
      data: {
        name: organizationName,
        type: orgType,
        industry,
        constructionTrade,
        subscriptionTier: tier,
        trialEndsAt: tier === "FREE" ? trialEndsAtFromNow() : null,
        subscriptionStatus: initialSubStatus,
        cheapScansRemaining: balances.cheapScansRemaining,
        premiumScansRemaining: balances.premiumScansRemaining,
        maxCompanies: balances.maxCompanies,
        users: {
          create: {
            email: normalized,
            name,
            role: "ORG_ADMIN",
            accountStatus: initialStatus,
            passwordHash,
          },
        },
      },
    });

    if (shouldApprove) {
      void sendAccessApprovedEmail(normalized, name, {
        variant: "registration_active",
        temporaryPassword: plainForEmail ?? undefined,
        tierLabelHe: tierLabelHe(tier),
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("sendAccessApprovedEmail (signup)", { error: msg });
      });
    } else {
      void sendRegistrationWelcomeEmail(normalized, name, {
        tierLabelHe: tierLabelHe(tier),
        tierKey: tier,
        accountActive: false,
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("sendRegistrationWelcomeEmail (signup pending)", { error: msg });
      });
    }
    if (!shouldApprove) {
      void sendNewRegistrationPendingAdminEmail({
        userEmail: normalized,
        userName: name,
        organizationName,
      });
    }

    return NextResponse.json({
      ok: true,
      message: shouldApprove
        ? plainForEmail
          ? "ההרשמה הושלמה. פרטי הסיסמה נשלחו לאימייל — ניתן להתחבר כעת."
          : "ההרשמה הושלמה. התחברו במייל והסיסמה שבחרתם."
        : "הבקשה נקלטה. מנהל המערכת יאשר את המנוי; לאחר האישור התחברו במייל וסיסמה.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("register failed", { error: msg });
    return jsonServerError("שגיאת שרת");
  }
}
