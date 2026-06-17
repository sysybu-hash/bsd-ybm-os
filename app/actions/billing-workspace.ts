"use server";

import { revalidatePath } from "next/cache";
import { revalidateErpDocumentsSurfaces } from "@/lib/workspace-revalidate";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import type {
  BillingWorkspaceV1,
  InsuranceExpenseLine,
  QuickPaymentPreset,
} from "@/lib/billing-workspace";
import { createLogger } from "@/lib/logger";
const log = createLogger("billing-workspace");

function canEdit(role: string): boolean {
  return role === UserRole.ORG_ADMIN || role === UserRole.SUPER_ADMIN;
}

export async function saveBillingWorkspaceAction(
  workspace: BillingWorkspaceV1,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, error: "׳ ׳“׳¨׳©׳× ׳”׳×׳—׳‘׳¨׳•׳×" };
  }
  const orgId = session.user.organizationId ?? null;
  const role = String(session.user.role ?? "");
  if (!orgId) {
    return { ok: false, error: "׳׳™׳ ׳׳¨׳’׳•׳ ׳׳©׳•׳™׳" };
  }
  if (!canEdit(role)) {
    return { ok: false, error: "׳¨׳§ ׳׳ ׳”׳ ׳׳¨׳’׳•׳ ׳¨׳©׳׳™ ׳׳©׳׳•׳¨" };
  }

  const cleanLines: InsuranceExpenseLine[] = (workspace.insuranceLines ?? [])
    .slice(0, 40)
    .map((l) => ({
      label: String(l.label ?? "").trim().slice(0, 200),
      amountNis: Math.max(0, Math.round(Number(l.amountNis) * 100) / 100),
    }))
    .filter((l) => l.label.length > 0);

  const ref = String(workspace.referralLevel ?? "none");
  const referralLevel =
    ref === "1" || ref === "2" || ref === "3" || ref === "4" || ref === "5" || ref === "none"
      ? ref
      : "none";

  const cleanPresets: QuickPaymentPreset[] = (workspace.quickPaymentPresets ?? [])
    .slice(0, 10)
    .map((p) => ({
      label: String(p.label ?? "").trim().slice(0, 120),
      amountNis: Math.round(Number(p.amountNis) * 100) / 100,
      invoiceDescription: String(p.invoiceDescription ?? "").trim().slice(0, 300) || undefined,
    }))
    .filter(
      (p) =>
        p.label.length > 0 &&
        Number.isFinite(p.amountNis) &&
        p.amountNis >= 1 &&
        p.amountNis <= 100_000,
    );

  const payload: BillingWorkspaceV1 = {
    v: 1,
    insuranceLines: cleanLines,
    referralLevel,
    referralNotes: String(workspace.referralNotes ?? "").slice(0, 4000),
    onboardingFreePitch: String(workspace.onboardingFreePitch ?? "").slice(0, 4000),
    quickPaymentPresets: cleanPresets,
  };

  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { billingWorkspaceJson: payload as object },
    });
    revalidateErpDocumentsSurfaces();
    revalidatePath("/app/settings/billing");
    revalidatePath("/app/settings/overview");
    return { ok: true };
  } catch (e) {
    log.error("saveBillingWorkspaceAction", e);
    return { ok: false, error: "׳©׳׳™׳¨׳” ׳ ׳›׳©׳׳”" };
  }
}

