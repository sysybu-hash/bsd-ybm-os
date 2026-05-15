import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import { canAccessMeckano } from "@/lib/meckano-access";
import type { Session } from "next-auth";

export type OsAssistantUserContext = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isPlatformAdmin: boolean;
  };
  organization: {
    id: string;
    name: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    industry: string;
    constructionTrade: string;
    cheapScansRemaining: number;
    premiumScansRemaining: number;
    maxCompanies: number;
    isVip: boolean;
    trialEndsAt: string | null;
  } | null;
  capabilities: {
    geminiLive: boolean;
    meckano: boolean;
  };
};

export async function buildOsAssistantUserContext(
  session: Session | null,
): Promise<OsAssistantUserContext | null> {
  if (!session?.user?.id) return null;

  const email = session.user.email?.trim() ?? "";
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { organization: true },
  });
  if (!user) return null;

  const org = user.organization;
  const meckano = await canAccessMeckano(session);

  return {
    user: {
      id: user.id,
      name: user.name?.trim() || email || "משתמש",
      email,
      role: String(session.user.role ?? user.role),
      isPlatformAdmin: isAdmin(email),
    },
    organization: org
      ? {
          id: org.id,
          name: org.name,
          subscriptionTier: org.subscriptionTier,
          subscriptionStatus: org.subscriptionStatus,
          industry: org.industry,
          constructionTrade: org.constructionTrade,
          cheapScansRemaining: org.cheapScansRemaining,
          premiumScansRemaining: org.premiumScansRemaining,
          maxCompanies: org.maxCompanies,
          isVip: org.isVip,
          trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
        }
      : null,
    capabilities: {
      geminiLive: Boolean(session.user.organizationId),
      meckano,
    },
  };
}

export function formatUserContextForPrompt(ctx: OsAssistantUserContext): string {
  const org = ctx.organization;
  const orgBlock = org
    ? [
        `ארגון: ${org.name}`,
        `תוכנית: ${org.subscriptionTier} (${org.subscriptionStatus})`,
        `ענף: ${org.industry} / ${org.constructionTrade}`,
        `סריקות זמינות: זולות ${org.cheapScansRemaining}, פרימיום ${org.premiumScansRemaining}`,
        org.isVip ? "מנוי VIP" : null,
        org.trialEndsAt ? `ניסיון עד: ${org.trialEndsAt.slice(0, 10)}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "אין ארגון משויך — הנחה במצב אישי מוגבל.";

  return [
    `משתמש מחובר: ${ctx.user.name} (${ctx.user.email})`,
    `תפקיד: ${ctx.user.role}${ctx.user.isPlatformAdmin ? " — מנהל פלטפורמה" : ""}`,
    orgBlock,
    `יכולות: Gemini Live=${ctx.capabilities.geminiLive ? "כן" : "לא"}, Meckano=${ctx.capabilities.meckano ? "כן" : "לא"}`,
  ].join("\n");
}
