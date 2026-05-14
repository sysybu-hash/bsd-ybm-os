"use server";

import { getServerSession } from "next-auth";
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

export type { ClientAiTableRow, ClientAiResult } from "@/lib/crm-client-ai";

/** ׳ ׳™׳×׳•׳— AI ׳׳׳§׳•׳— ג€” Gemini Flash (FREE) / Pro (PRO+ ׳׳• SUPER_ADMIN) */
export async function analyzeClientAI(orgId: string): Promise<ClientAiResult> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "׳—׳¡׳¨ ׳׳₪׳×׳— Gemini ׳‘׳©׳¨׳× (GOOGLE_GENERATIVE_AI_API_KEY ׳׳• GEMINI_API_KEY).",
    };
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return {
        ok: false,
        error: "׳™׳© ׳׳”׳×׳—׳‘׳¨ ׳׳׳¢׳¨׳›׳× ׳›׳“׳™ ׳׳‘׳¦׳¢ ׳ ׳™׳×׳•׳— AI.",
      };
    }

    const userOrgId = session.user.organizationId ?? null;
    const platformOwner = isAdmin(session.user.email);
    if (userOrgId !== orgId && !platformOwner) {
      return {
        ok: false,
        error: "׳׳™׳ ׳׳ ׳”׳¨׳©׳׳” ׳׳ ׳×׳— ׳ ׳×׳•׳ ׳™׳ ׳©׳ ׳׳¨׳’׳•׳ ׳–׳”.",
      };
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
      return { ok: false, error: "׳׳ ׳ ׳׳¦׳ ׳ ׳×׳•׳ ׳™׳ ׳¢׳ ׳”׳׳¨׳’׳•׳." };
    }

    const modelToUse = resolveCrmGeminiModel(
      org.subscriptionTier,
      session.user.role,
      platformOwner,
    );

    const tableData = buildTableDataFromInvoices(org.invoices);

    const prompt = `׳׳×׳” ׳׳ ׳×׳— ׳׳§׳•׳— B2B ׳‘׳׳¢׳¨׳›׳× BSD-YBM.
׳׳”׳׳ ׳ ׳×׳•׳ ׳™ ׳×׳©׳׳•׳׳™׳ (׳‘׳©׳§׳׳™׳). ׳׳›׳ ׳©׳•׳¨׳” ׳›׳‘׳¨ ׳—׳•׳©׳‘׳” ׳¢׳׳׳× PayPlus ׳‘׳“׳™׳•׳§ ׳›ײ¾1.2% ׳׳”׳‘׳¨׳•׳˜׳• + 1.2 ׳©"׳—, ׳•׳”׳ ׳˜׳• ג€” ׳׳ ׳×׳©׳ ׳” ׳׳¡׳₪׳¨׳™׳.

׳©׳ ׳׳¨׳’׳•׳: ${org.name}
׳׳™׳׳™׳™׳ ׳§׳©׳¨: ${org.users[0]?.email ?? "׳׳ ׳™׳“׳•׳¢"}

׳ ׳×׳•׳ ׳™ ׳˜׳‘׳׳” (JSON):
${JSON.stringify(tableData, null, 0)}

׳”׳—׳–׳¨ ׳׳ ׳•׳¨׳§ ׳׳•׳‘׳™׳™׳§׳˜ JSON ׳×׳§׳ ׳™ (׳‘׳׳™ markdown, ׳‘׳׳™ backticks) ׳‘׳׳‘׳ ׳” ׳”׳׳“׳•׳™׳§:
{
  "summary": "׳₪׳¡׳§׳” ׳§׳¦׳¨׳” ׳‘׳¢׳‘׳¨׳™׳× ׳¢׳ ׳׳¦׳‘ ׳”׳×׳©׳׳•׳׳™׳ ׳•׳”׳׳§׳•׳—",
  "alerts": ["׳”׳×׳¨׳׳” ׳׳•׳₪׳¦׳™׳•׳ ׳׳™׳× ג€” ׳׳׳©׳ ׳׳§׳•׳— ׳¨׳“׳•׳ ׳׳ ׳׳™׳ ׳×׳©׳׳•׳ 30+ ׳™׳•׳", "..."],
  "recommendation": "׳”׳׳׳¦׳” ׳¢׳¡׳§׳™׳× ׳§׳¦׳¨׳” ׳׳©׳™׳׳•׳¨ ׳”׳׳§׳•׳—"
}

׳׳ ׳׳™׳ ׳”׳×׳¨׳׳•׳× ג€” ׳”׳—׳–׳¨ ׳׳¢׳¨׳ ׳¨׳™׳§ [].`;

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
          : "׳©׳’׳™׳׳” ׳׳ ׳™׳“׳•׳¢׳”";
      console.error("Gemini HTTP:", response.status, data);
      return {
        ok: false,
        error: `׳©׳’׳™׳׳” ׳-Gemini (${response.status}): ${msg}`,
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
        typeof parsed.summary === "string" ? parsed.summary : rawText || "ג€”";
      recommendation =
        typeof parsed.recommendation === "string" ? parsed.recommendation : "ג€”";
      if (Array.isArray(parsed.alerts)) {
        alerts = parsed.alerts.filter((a): a is string => typeof a === "string");
      }
    } catch {
      summary = rawText || "׳׳ ׳ ׳™׳×׳ ׳׳₪׳¨׳¡׳¨ ׳׳× ׳×׳©׳•׳‘׳× ׳”׳׳•׳“׳.";
      recommendation = "ג€”";
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
    console.error("analyzeClientAI:", message);
    return { ok: false, error: "׳©׳’׳™׳׳× ׳¨׳©׳× ׳׳• ׳©׳¨׳× ׳‘׳ ׳™׳×׳•׳— AI." };
  }
}

export async function deleteOrganization(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return { error: "׳׳™׳ ׳”׳¨׳©׳׳” ׳׳׳—׳™׳§׳× ׳׳¨׳’׳•׳" };
  }
  try {
    await prisma.organization.delete({ where: { id } });
revalidatePath("/app/crm");
revalidatePath("/app");
    return { success: true as const };
  } catch {
    return { error: "׳©׳’׳™׳׳” ׳‘׳׳—׳™׳§׳× ׳”׳׳¨׳’׳•׳" };
  }
}

export async function updateOrgPlan(id: string, tierRaw: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return { error: "׳׳™׳ ׳”׳¨׳©׳׳” ׳׳¢׳“׳›׳•׳ ׳׳¡׳׳•׳ ׳׳¨׳’׳•׳" };
  }
  const tier = parseSubscriptionTier(tierRaw);
  if (!tier) {
    return { error: "׳¨׳׳× ׳׳ ׳•׳™ ׳׳ ׳—׳•׳§׳™׳×" };
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
    return { error: "׳©׳’׳™׳׳” ׳‘׳¢׳“׳›׳•׳ ׳”׳×׳•׳›׳ ׳™׳×" };
  }
}

export async function updateOrganizationName(id: string, name: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return { error: "׳׳™׳ ׳”׳¨׳©׳׳” ׳׳¢׳“׳›׳•׳ ׳©׳ ׳׳¨׳’׳•׳" };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { error: "׳©׳ ׳§׳¦׳¨ ׳׳“׳™" };
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
    return { error: "׳©׳’׳™׳׳” ׳‘׳¢׳“׳›׳•׳ ׳”׳©׳" };
  }
}

