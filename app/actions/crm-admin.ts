"use server";

import { getServerSession } from "next-auth";
import { env } from "@/lib/env";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  buildTableDataFromInvoices,
  type ClientAiResult,
} from "@/lib/crm-client-ai";
import { resolveCrmGeminiModel } from "@/lib/crm-gemini-model";
import {
  defaultScanBalancesForTier,
  parseSubscriptionTier,
} from "@/lib/subscription-tier-config";
import { isAdmin } from "@/lib/is-admin";
import {
  financeMutationRoles,
  requireOSAdminAction,
  requireWorkspaceAction,
} from "@/lib/server-action-auth";

export type { ClientAiTableRow, ClientAiResult } from "@/lib/crm-client-ai";
import { createLogger } from "@/lib/logger";
const log = createLogger("crm-admin");

/** ניתוח AI ללקוח — Gemini Flash (FREE) / Pro (PRO+ או SUPER_ADMIN) */
export async function analyzeClientAI(orgId: string): Promise<ClientAiResult> {
  const apiKey =
    env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "חסר מפתח Gemini בשרת (GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY).",
    };
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return {
        ok: false,
        error: "יש להתחבר למערכת כדי לבצע ניתוח AI.",
      };
    }

    const platformOwner = isAdmin(session.user.email);
    if (!platformOwner) {
      const auth = await requireWorkspaceAction({
        allowedRoles: financeMutationRoles(),
      });
      if (!auth.ok) {
        return { ok: false, error: auth.error };
      }
      if (auth.ctx.organizationId !== orgId) {
        return {
          ok: false,
          error: "אין לך הרשאה לנתח נתונים של ארגון זה.",
        };
      }
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        invoices: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            status: true,
            description: true,
            paidAt: true,
            createdAt: true,
          },
        },
        users: { take: 1, select: { email: true } },
      },
    });

    if (!org) {
      return { ok: false, error: "לא נמצאו נתונים על הארגון." };
    }

    const modelToUse = resolveCrmGeminiModel(
      org.subscriptionTier,
      session.user.role,
      platformOwner,
    );

    const tableData = buildTableDataFromInvoices(org.invoices);

    const prompt = `אתה מנתח לקוח B2B במערכת BSD-YBM.
להלן נתוני תשלומים (בשקלים). לכל שורה כבר חושבה עמלת PayPlus בדיוק כ־1.2% מהברוטו + 1.2 ש"ח, והנטו — אל תשנה מספרים.

שם ארגון: ${org.name}
אימייל קשר: ${org.users[0]?.email ?? "לא ידוע"}

נתוני טבלה (JSON):
${JSON.stringify(tableData, null, 0)}

החזר אך ורק אובייקט JSON תקני (בלי markdown, בלי backticks) במבנה המדויק:
{
  "summary": "פסקה קצרה בעברית על מצב התשלומים והלקוח",
  "alerts": ["התראה אופציונלית — למשל לקוח רדום אם אין תשלום 30+ יום", "..."],
  "recommendation": "המלצה עסקית קצרה לשימור הלקוח"
}

אם אין התראות — החזר מערך ריק [].`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToUse)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const msg =
        typeof (data as { error?: { message?: string } }).error?.message ===
        "string"
          ? (data as { error: { message: string } }).error.message
          : "שגיאה לא ידועה";
      log.error("Gemini HTTP:", response.status, data);
      return {
        ok: false,
        error: `שגיאה מ-Gemini (${response.status}): ${msg}`,
      };
    }

    const rawText =
      (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        .candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let summary = "";
    let alerts: string[] = [];
    let recommendation = "";

    try {
      const parsed = JSON.parse(cleaned) as {
        summary?: string;
        alerts?: unknown;
        recommendation?: string;
      };
      summary =
        typeof parsed.summary === "string" ? parsed.summary : rawText || "—";
      recommendation =
        typeof parsed.recommendation === "string" ? parsed.recommendation : "—";
      if (Array.isArray(parsed.alerts)) {
        alerts = parsed.alerts.filter((a): a is string => typeof a === "string");
      }
    } catch {
      summary = rawText || "לא ניתן לפרסר את תשובת המודל.";
      recommendation = "—";
    }

    return {
      ok: true,
      summary,
      alerts,
      recommendation,
      tableData,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("analyzeClientAI:", message);
    return { ok: false, error: "שגיאת רשת או שרת בניתוח AI." };
  }
}

export async function deleteOrganization(id: string) {
  const gate = await requireOSAdminAction();
  if (!gate.ok) {
    return { error: "אין הרשאה למחיקת ארגון" };
  }
  try {
    await prisma.organization.delete({ where: { id } });
    revalidatePath("/app/crm");
    revalidatePath("/app");
    return { success: true as const };
  } catch {
    return { error: "שגיאה במחיקת הארגון" };
  }
}

export async function updateOrgPlan(id: string, tierRaw: string) {
  const gate = await requireOSAdminAction();
  if (!gate.ok) {
    return { error: "אין הרשאה לעדכון מסלול ארגון" };
  }
  const tier = parseSubscriptionTier(tierRaw);
  if (!tier) {
    return { error: "רמת מנוי לא חוקית" };
  }
  const balances = defaultScanBalancesForTier(tier);
  try {
    await prisma.organization.update({
      where: { id },
      data: {
        subscriptionTier: tier,
        cheapScansRemaining: balances.cheapScansRemaining,
        premiumScansRemaining: balances.premiumScansRemaining,
        maxCompanies: balances.maxCompanies,
      },
    });
    revalidatePath("/app/crm");
    revalidatePath("/app");
    revalidatePath("/app/settings/billing");
    return { success: true as const };
  } catch {
    return { error: "שגיאה בעדכון התוכנית" };
  }
}

export async function updateOrganizationName(id: string, name: string) {
  const gate = await requireOSAdminAction();
  if (!gate.ok) {
    return { error: "אין הרשאה לעדכון שם ארגון" };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { error: "שם קצר מדי" };
  }
  try {
    await prisma.organization.update({
      where: { id },
      data: { name: trimmed },
    });
    revalidatePath("/app/crm");
    revalidatePath("/app");
    return { success: true as const };
  } catch {
    return { error: "שגיאה בעדכון השם" };
  }
}
