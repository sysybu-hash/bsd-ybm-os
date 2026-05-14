"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createTestInvoiceAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;

  if (!session?.user?.id) {
    return { ok: false, error: "׳ ׳“׳¨׳©׳× ׳”׳×׳—׳‘׳¨׳•׳×" };
  }
  if (!orgId) {
    return { ok: false, error: "׳׳™׳ ׳׳¨׳’׳•׳ ׳׳©׳•׳™׳ ׳׳׳©׳×׳׳©" };
  }

  try {
    await prisma.invoice.create({
      data: {
        organizationId: orgId,
        amount: 250,
        status: "PENDING",
        description: "׳—׳©׳‘׳•׳ ׳™׳× ׳‘׳“׳™׳§׳” ׳׳¡׳׳™׳§׳× PayPlus",
        invoiceNumber: `INV-${Math.floor(Math.random() * 10000)}`,
        customerName: "׳™׳•׳—׳ ׳ ׳‘׳•׳§׳©׳₪׳ - ׳˜׳¡׳˜",
        customerEmail: "test@bsd-ybm.co.il",
      },
    });
    revalidatePath("/app/documents/erp");
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch (e) {
    console.error("createTestInvoiceAction", e);
    return { ok: false, error: "׳™׳¦׳™׳¨׳× ׳—׳©׳‘׳•׳ ׳™׳× ׳ ׳›׳©׳׳”" };
  }
}

const AMOUNT_MIN = 1;
const AMOUNT_MAX = 100_000;

/** ׳‘׳§׳©׳× ׳×׳©׳׳•׳ (Invoice) ׳‘׳¡׳›׳•׳ ׳׳‘׳—׳™׳¨׳” ג€” ׳׳•׳₪׳™׳¢׳” ׳‘׳˜׳‘׳׳× ׳”׳—׳™׳•׳‘ + PayPal.Me */
export async function createQuickPaymentInvoiceAction(
  amountRaw: unknown,
  descriptionRaw?: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;

  if (!session?.user?.id) {
    return { ok: false, error: "׳ ׳“׳¨׳©׳× ׳”׳×׳—׳‘׳¨׳•׳×" };
  }
  if (!orgId) {
    return { ok: false, error: "׳׳™׳ ׳׳¨׳’׳•׳ ׳׳©׳•׳™׳ ׳׳׳©׳×׳׳©" };
  }

  const n = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);
  if (!Number.isFinite(n) || n < AMOUNT_MIN || n > AMOUNT_MAX) {
    return { ok: false, error: `׳¡׳›׳•׳ ׳—׳™׳™׳‘ ׳׳”׳™׳•׳× ׳‘׳™׳ ${AMOUNT_MIN} ׳ײ¾${AMOUNT_MAX} ג‚×` };
  }
  const amount = Math.round(n * 100) / 100;
  const description =
    String(descriptionRaw ?? "").trim() || `׳‘׳§׳©׳× ׳×׳©׳׳•׳ ג‚×${amount.toLocaleString("he-IL")}`;

  try {
    await prisma.invoice.create({
      data: {
        organizationId: orgId,
        amount,
        status: "PENDING",
        description,
        invoiceNumber: `REQ-${Date.now().toString(36).toUpperCase()}`,
        customerName: session.user.name?.trim() || "׳׳§׳•׳—",
        customerEmail: session.user.email?.trim() || null,
      },
    });
    revalidatePath("/app/documents/erp");
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch (e) {
    console.error("createQuickPaymentInvoiceAction", e);
    return { ok: false, error: "׳™׳¦׳™׳¨׳× ׳‘׳§׳©׳× ׳×׳©׳׳•׳ ׳ ׳›׳©׳׳”" };
  }
}

