"use server";

import { revalidatePath } from "next/cache";
import { revalidateErpDocumentsSurfaces } from "@/lib/workspace-revalidate";
import { prisma } from "@/lib/prisma";
import {
  financeMutationRoles,
  requireOSAdminAction,
  requireWorkspaceAction,
} from "@/lib/server-action-auth";
import { createLogger } from "@/lib/logger";
const log = createLogger("billing-invoice");

/** Test invoice — blocked for regular users in production (platform admin only). */
export async function createTestInvoiceAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (process.env.NODE_ENV === "production") {
    const admin = await requireOSAdminAction();
    if (!admin.ok) {
      return { ok: false, error: "חשבונית בדיקה זמינה רק למנהל פלטפורמה בפרודקשן" };
    }
  }

  const auth = await requireWorkspaceAction({ allowedRoles: financeMutationRoles() });
  if (!auth.ok) return { ok: false, error: auth.error };
  const orgId = auth.ctx.organizationId;

  try {
    await prisma.invoice.create({
      data: {
        organizationId: orgId,
        amount: 250,
        status: "PENDING",
        description: "חשבונית בדיקה לסליקה",
        invoiceNumber: `INV-${Math.floor(Math.random() * 10000)}`,
        customerName: "יוחנן בוקשפן - טסט",
        customerEmail: "test@bsd-ybm.co.il",
      },
    });
    revalidateErpDocumentsSurfaces();
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch (e) {
    log.error("createTestInvoiceAction", e);
    return { ok: false, error: "יצירת חשבונית נכשלה" };
  }
}

const AMOUNT_MIN = 1;
const AMOUNT_MAX = 100_000;

/** בקשת תשלום (Invoice) בסכום לבחירה — מופיעה בטבלת החיוב + PayPal.Me */
export async function createQuickPaymentInvoiceAction(
  amountRaw: unknown,
  descriptionRaw?: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireWorkspaceAction({ allowedRoles: financeMutationRoles() });
  if (!auth.ok) return { ok: false, error: auth.error };
  const orgId = auth.ctx.organizationId;

  const n = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);
  if (!Number.isFinite(n) || n < AMOUNT_MIN || n > AMOUNT_MAX) {
    return { ok: false, error: `סכום חייב להיות בין ${AMOUNT_MIN} ל־${AMOUNT_MAX} ₪` };
  }
  const amount = Math.round(n * 100) / 100;
  const description =
    String(descriptionRaw ?? "").trim() || `בקשת תשלום ₪${amount.toLocaleString("he-IL")}`;

  try {
    await prisma.invoice.create({
      data: {
        organizationId: orgId,
        amount,
        status: "PENDING",
        description,
        invoiceNumber: `REQ-${Date.now().toString(36).toUpperCase()}`,
        customerName: auth.ctx.email?.split("@")[0] || "לקוח",
        customerEmail: auth.ctx.email,
      },
    });
    revalidateErpDocumentsSurfaces();
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch (e) {
    log.error("createQuickPaymentInvoiceAction", e);
    return { ok: false, error: "יצירת בקשת תשלום נכשלה" };
  }
}
