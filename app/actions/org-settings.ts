"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { MECKANO_ACCESS_ERROR, canAccessMeckano } from "@/lib/meckano-access";
import { prisma } from "@/lib/prisma";
import { type CompanyType, type CustomerType, Prisma, UserRole } from "@prisma/client";
import { isExecutiveSubscriptionSuperAdmin } from "@/lib/executive-subscription-super-admin";
import { defaultScanBalancesForTier, parseSubscriptionTier } from "@/lib/subscription-tier-config";
import { trialEndsAtFromNow } from "@/lib/trial";
import { normalizeConstructionTrade } from "@/lib/construction-trades";

const TYPES: CustomerType[] = ["HOME", "FREELANCER", "COMPANY", "ENTERPRISE"];
const COMPANY_TYPES: CompanyType[] = ["EXEMPT_DEALER", "LICENSED_DEALER", "LTD_COMPANY"];
function canEditTaxProfile(role: string): boolean {
  return role === UserRole.ORG_ADMIN || role === UserRole.SUPER_ADMIN;
}

function revalidateWorkspace() {
  revalidatePath("/app");
  revalidatePath("/app/clients");
  revalidatePath("/app/documents");
  revalidatePath("/app/documents/erp");
  revalidatePath("/app/documents/issue");
  revalidatePath("/app/ai");
  revalidatePath("/app/finance");
  revalidatePath("/app/settings");
  revalidatePath("/app/settings/billing");
}

function normalizeLabel(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export async function updateOrganizationAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, error: "נדרשת התחברות" };
  }

  const orgId = session.user.organizationId ?? null;
  const role = String(session.user.role ?? "");

  if (!orgId) {
    return { ok: false as const, error: "אין ארגון משויך" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    return { ok: false as const, error: "יש להזין שם חברה / ארגון" };
  }

  const typeRaw = String(formData.get("type") || "HOME").trim();
  const type = TYPES.includes(typeRaw as CustomerType) ? (typeRaw as CustomerType) : "HOME";

  const taxOk = canEditTaxProfile(role);

  const companyTypeRaw = String(formData.get("companyType") || "").trim();
  const taxId = String(formData.get("taxId") || "").trim();
  const address = String(formData.get("address") || "").trim();

  if (!taxOk && (companyTypeRaw || taxId || address)) {
    return {
      ok: false as const,
      error: "רק מנהל ארגון או מנהל מערכת יכולים לעדכן פרטי מס וכתובת.",
    };
  }

  const data: {
    name: string;
    type: CustomerType;
    companyType?: CompanyType;
    taxId?: string | null;
    address?: string | null;
    isReportable?: boolean;
  } = { name, type };

  if (taxOk) {
    const ct: CompanyType = COMPANY_TYPES.includes(companyTypeRaw as CompanyType)
      ? (companyTypeRaw as CompanyType)
      : "LICENSED_DEALER";
    data.companyType = ct;
    data.taxId = taxId.length > 0 ? taxId : null;
    data.address = address.length > 0 ? address : null;
    data.isReportable = formData.get("isReportable") === "on";
  }

  await prisma.organization.update({ where: { id: orgId }, data });
  revalidateWorkspace();
  return { ok: true as const };
}

/** פורטל המנוי: דומיין, מיתוג JSON, לוח שנה + סנכרון Google (מתג בלבד — OAuth בשלב הבא) */
export async function updateTenantPortalAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, error: "נדרשת התחברות" };
  }
  const orgId = session.user.organizationId ?? null;
  const role = String(session.user.role ?? "");
  if (!orgId) {
    return { ok: false as const, error: "אין ארגון משויך" };
  }
  if (role !== UserRole.ORG_ADMIN && role !== UserRole.SUPER_ADMIN) {
    return { ok: false as const, error: "רק מנהל ארגון רשאי לעדכן הגדרות פורטל" };
  }

  const domain = String(formData.get("tenantPublicDomain") ?? "").trim() || null;
  const calendarGoogleEnabled = formData.get("calendarGoogleEnabled") === "on";
  const brandingRaw = String(formData.get("tenantSiteBrandingJson") ?? "").trim();

  let brandingValue: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (brandingRaw.length > 0) {
    try {
      brandingValue = JSON.parse(brandingRaw) as Prisma.InputJsonValue;
    } catch {
      return { ok: false as const, error: "JSON מיתוג לא תקין" };
    }
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      tenantPublicDomain: domain,
      calendarGoogleEnabled,
      tenantSiteBrandingJson: brandingValue,
    },
  });

  revalidateWorkspace();
  return { ok: true as const };
}

const LIVE_TIERS = new Set(["basic", "standard", "premium"]);

/** PayPal + רמת נתונים חיים — מנהל ארגון */
export async function updateBillingConnectionsAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, error: "נדרשת התחברות" };
  }
  const orgId = session.user.organizationId ?? null;
  const role = String(session.user.role ?? "");
  if (!orgId) {
    return { ok: false as const, error: "אין ארגון משויך" };
  }
  if (role !== UserRole.ORG_ADMIN && role !== UserRole.SUPER_ADMIN) {
    return { ok: false as const, error: "רק מנהל ארגון רשאי לעדכן" };
  }

  const paypalEmail = String(formData.get("paypalMerchantEmail") ?? "").trim() || null;
  const slugRaw = String(formData.get("paypalMeSlug") ?? "").trim();
  const paypalMeSlug =
    slugRaw.length > 0 ? slugRaw.replace(/^https?:\/\/(www\.)?paypal\.me\//i, "").replace(/\/$/, "") : null;
  const tierRaw = String(formData.get("liveDataTier") ?? "basic").trim();
  const liveDataTier = LIVE_TIERS.has(tierRaw) ? tierRaw : "basic";

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      paypalMerchantEmail: paypalEmail,
      paypalMeSlug: paypalMeSlug,
      liveDataTier,
    },
  });

  revalidateWorkspace();
  return { ok: true as const };
}

/** מקאנו — שמירת API key לארגון */
export async function updateMeckanoApiKeyAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, error: "נדרשת התחברות" };
  }
  if (!(await canAccessMeckano(session))) {
    return { ok: false as const, error: MECKANO_ACCESS_ERROR };
  }
  const orgId = session.user.organizationId ?? null;
  const role = String(session.user.role ?? "");
  if (!orgId) {
    return { ok: false as const, error: "אין ארגון משויך" };
  }
  if (role !== UserRole.ORG_ADMIN && role !== UserRole.SUPER_ADMIN) {
    return { ok: false as const, error: "רק מנהל ארגון רשאי להגדיר אינטגרציות" };
  }
  const key = String(formData.get("meckanoApiKey") ?? "").trim();
  await prisma.organization.update({
    where: { id: orgId },
    data: { meckanoApiKey: key.length > 0 ? key : null },
  });
  revalidateWorkspace();
  revalidatePath("/app/operations");
  revalidatePath("/app/operations/meckano");
  return { ok: true as const };
}

/** ניהול מנועי AI — בחירת מנוע ברירת מחדל, מודלים ומפתחות */
export async function updateAiConfigAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, error: "נדרשת התחברות" };
  }
  const orgId = session.user.organizationId ?? null;
  const role = String(session.user.role ?? "");
  if (!orgId) {
    return { ok: false as const, error: "אין ארגון משויך" };
  }
  if (role !== UserRole.ORG_ADMIN && role !== UserRole.SUPER_ADMIN) {
    return { ok: false as const, error: "רק מנהל ארגון רשאי לעדכן הגדרות AI" };
  }

  // שאיבת הגדרות קיימות כדי לא לדרוס נתוני industry אחרים
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { industryConfigJson: true }
  });

  const existingConfig = (org?.industryConfigJson as Record<string, any>) || {};

  const aiPrimary = String(formData.get("ai_primary") || "gemini").trim();
  const geminiModel = String(formData.get("model_gemini") || "flash").trim();
  const geminiKey = String(formData.get("gemini_key") || "").trim();
  const openaiModel = String(formData.get("model_openai") || "4o-mini").trim();
  const openaiKey = String(formData.get("openai_key") || "").trim();
  const anthropicModel = String(formData.get("model_anthropic") || "sonnet").trim();
  const anthropicKey = String(formData.get("anthropic_key") || "").trim();

  const newAiConfig = {
    ...existingConfig,
    aiControl: {
      primary: aiPrimary,
      gemini: { model: geminiModel, key: geminiKey },
      openai: { model: openaiModel, key: openaiKey },
      anthropic: { model: anthropicModel, key: anthropicKey },
      updatedAt: new Date().toISOString()
    }
  };

  await prisma.organization.update({
    where: { id: orgId },
    data: { industryConfigJson: newAiConfig },
  });
  revalidateWorkspace();
  return { ok: true as const };
}

export async function updateIndustryProfileAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, error: "נדרשת התחברות" };
  }

  const orgId = session.user.organizationId ?? null;
  const role = String(session.user.role ?? "");
  if (!orgId) {
    return { ok: false as const, error: "אין ארגון משויך" };
  }
  if (role !== UserRole.ORG_ADMIN && role !== UserRole.SUPER_ADMIN) {
    return { ok: false as const, error: "רק מנהל ארגון רשאי לעדכן מקצוע ושפה" };
  }

  const constructionTrade = normalizeConstructionTrade(String(formData.get("constructionTrade") ?? ""));

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { industryConfigJson: true },
  });
  const existingConfig =
    typeof org?.industryConfigJson === "object" && org.industryConfigJson !== null && !Array.isArray(org.industryConfigJson)
      ? (org.industryConfigJson as Record<string, unknown>)
      : {};

  const nextConfig = {
    ...existingConfig,
    customLabels: {
      clients: normalizeLabel(formData.get("customClientsLabel")),
      documents: normalizeLabel(formData.get("customDocumentsLabel")),
      records: normalizeLabel(formData.get("customRecordsLabel")),
      client: normalizeLabel(formData.get("customClientWord")),
      project: normalizeLabel(formData.get("customProjectWord")),
      document: normalizeLabel(formData.get("customDocumentWord")),
    },
    updatedAt: new Date().toISOString(),
  };

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      industry: "CONSTRUCTION",
      constructionTrade,
      industryConfigJson: nextConfig,
    },
  });

  revalidateWorkspace();
  return { ok: true as const };
}

export async function updateCurrentSubscriptionAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, error: "נדרשת התחברות" };
  }

  const actorEmail = session.user.email?.trim().toLowerCase() ?? "";
  /** מנוי בתשלום לא נקבע ידנית ממסך הגדרות — רק בעל הפלטפורמה (או תשלום / הזמנה / אדמין מרכז) */
  if (!isExecutiveSubscriptionSuperAdmin(actorEmail)) {
    return {
      ok: false as const,
      error:
        "מסלול וסטטוס המנוי נקבעים אוטומטית לאחר תשלום או הזמנה מוסמכת. לשדרוג יש לעבור לעמוד החיוב או לפנות לתמיכה.",
    };
  }

  const orgId = session.user.organizationId ?? null;
  const role = String(session.user.role ?? "");
  if (!orgId) {
    return { ok: false as const, error: "אין ארגון משויך" };
  }
  if (role !== UserRole.ORG_ADMIN && role !== UserRole.SUPER_ADMIN) {
    return { ok: false as const, error: "רק מנהל ארגון רשאי לעדכן מנוי" };
  }

  const tier = parseSubscriptionTier(String(formData.get("subscriptionTier") ?? "").trim());
  const statusRaw = String(formData.get("subscriptionStatus") ?? "ACTIVE").trim().toUpperCase();
  if (!tier) {
    return { ok: false as const, error: "רמת מנוי לא חוקית" };
  }
  if (!statusRaw) {
    return { ok: false as const, error: "סטטוס מנוי חסר" };
  }

  const balances = defaultScanBalancesForTier(tier);

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      subscriptionTier: tier,
      subscriptionStatus: statusRaw,
      cheapScansRemaining: balances.cheapScansRemaining,
      premiumScansRemaining: balances.premiumScansRemaining,
      maxCompanies: balances.maxCompanies,
      trialEndsAt: tier === "FREE" ? trialEndsAtFromNow() : null,
    },
  });

  revalidateWorkspace();
  return { ok: true as const };
}
