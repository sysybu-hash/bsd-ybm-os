import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  jsonBadRequest,
  jsonConflict,
  jsonServerError,
} from "@/lib/api-json";
import { AccountStatus, CustomerType } from "@prisma/client";
import { trialEndsAtFromNow } from "@/lib/trial";
import { sendRegistrationWelcomeEmail } from "@/lib/mail";
import { defaultScanBalancesForTier, tierLabelHe } from "@/lib/subscription-tier-config";
import { normalizeConstructionTrade } from "@/lib/construction-trades";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    };

    const emailRaw = String(body.email ?? "").trim();
    const name = String(body.name ?? "").trim() || null;
    const organizationName = String(body.organizationName ?? "").trim();
    const typeRaw = String(body.orgType ?? "COMPANY").toUpperCase();
    const constructionTrade = normalizeConstructionTrade(body.constructionTrade);
    const inviteToken = String(body.inviteToken ?? "").trim();
    const orgInviteToken = String(body.orgInviteToken ?? "").trim();

    if (!EMAIL_RE.test(emailRaw)) {
      return jsonBadRequest("אימייל לא תקין", "invalid_email");
    }

    const normalized = emailRaw.toLowerCase();

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
              },
            });
          }
          await tx.organizationInvite.update({
            where: { id: inv.id },
            data: { usedAt: new Date() },
          });
        });
      } catch (e) {
        console.error("register orgInvite", e);
        return jsonServerError("שגיאה בשמירת המשתמש");
      }

      const joinedOrg = await prisma.organization.findUnique({
        where: { id: inv.organizationId },
        select: { subscriptionTier: true },
      });
      const tier = joinedOrg?.subscriptionTier ?? "FREE";
      void sendRegistrationWelcomeEmail(normalized, name, {
        tierLabelHe: tierLabelHe(tier),
        tierKey: tier,
        accountActive: true,
        extraNote:
          "הצטרפתם לארגון קיים כחברי צוות. Welcome to BSD-YBM — הרשאות לפי ההזמנה.",
      }).catch((err) => console.error("sendRegistrationWelcomeEmail (orgInvite)", err));

      return NextResponse.json({
        ok: true,
        message:
          "ההרשמה הושלמה. התחברו עם Google באותו אימייל — התפקיד שנקבע בהזמנה הוחל.",
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
            industry: "CONSTRUCTION",
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
              },
            },
          },
        });
        await tx.subscriptionInvitation.update({
          where: { id: inv.id },
          data: { usedAt: new Date() },
        });
      });

      void sendRegistrationWelcomeEmail(normalized, name, {
        tierLabelHe: tierLabelHe(inv.subscriptionTier),
        tierKey: inv.subscriptionTier,
        accountActive: true,
        extraNote:
          inv.subscriptionTier === "FREE"
            ? "Welcome to BSD-YBM! You are currently on the FREE tier with an active trial window where applicable."
            : undefined,
      }).catch((err) => console.error("sendRegistrationWelcomeEmail (invite)", err));

      return NextResponse.json({
        ok: true,
        message:
          "ההרשמה הושלמה — נוצר ארגון חדש ואתם מנהליו. ניתן להתחבר עם Google באותו אימייל.",
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
        industry: "CONSTRUCTION",
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
          },
        },
      },
    });

    void sendRegistrationWelcomeEmail(normalized, name, {
      tierLabelHe: tierLabelHe(tier),
      tierKey: tier,
      accountActive: shouldApprove,
      extraNote: shouldApprove
        ? `Welcome to BSD-YBM! Your ${tierLabelHe(tier)} account is now ACTIVE.`
        : "Welcome to BSD-YBM! You are currently on the FREE tier pending admin approval — you will receive full access once approved.",
    }).catch((err) => console.error("sendRegistrationWelcomeEmail (signup)", err));

    return NextResponse.json({
      ok: true,
      message: shouldApprove 
        ? "ההרשמה הושלמה בהצלחה! ניתן להתחבר כעת."
        : "הבקשה נקלטה. מנהל המערכת יאשר את המנוי וישלח לך פרטי כניסה.",
    });
  } catch (e) {
    console.error("register", e);
    return jsonServerError("שגיאת שרת");
  }
}
