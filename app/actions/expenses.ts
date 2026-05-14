"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { ExpenseAllocation, ExpenseRecordStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function revalidateFinance() {
  revalidatePath("/app/erp");
  revalidatePath("/app/crm");
  revalidatePath("/app");
}

async function getOrgContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "נדרשת התחברות" as const };
  }
  const orgId = session.user.organizationId ?? null;
  if (!orgId) {
    return { error: "אין ארגון משויך. עבור להגדרות או התחבר מחדש." as const };
  }
  return { orgId };
}

function parseAllocation(raw: string): ExpenseAllocation {
  if (raw === "PROJECT") return ExpenseAllocation.PROJECT;
  if (raw === "CLIENT") return ExpenseAllocation.CLIENT;
  return ExpenseAllocation.OFFICE;
}

function parseStatus(raw: string): ExpenseRecordStatus {
  return raw === "DRAFT" ? ExpenseRecordStatus.DRAFT : ExpenseRecordStatus.POSTED;
}

export async function createExpenseAction(formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const vendorName = String(formData.get("vendorName") || "").trim();
  if (!vendorName) return { ok: false as const, error: "יש להזין שם ספק" };

  const amountNet = parseFloat(String(formData.get("amountNet") || "0"));
  if (!Number.isFinite(amountNet) || amountNet < 0) {
    return { ok: false as const, error: "סכום לפני מע״מ לא תקין" };
  }

  const vat = parseFloat(String(formData.get("vat") || "0")) || 0;
  const totalRaw = parseFloat(String(formData.get("total") || ""));
  const total =
    Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : Math.round((amountNet + vat) * 100) / 100;
  const allocation = parseAllocation(String(formData.get("allocation") || "OFFICE"));
  const status = parseStatus(String(formData.get("status") || "POSTED"));
  const expenseDateRaw = String(formData.get("expenseDate") || "").trim();
  const expenseDate = expenseDateRaw ? new Date(`${expenseDateRaw}T12:00:00`) : new Date();
  const invoiceNumber = String(formData.get("invoiceNumber") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;

  let projectId: string | null = String(formData.get("projectId") || "").trim() || null;
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, organizationId: ctx.orgId }, select: { id: true } });
    projectId = p?.id ?? null;
  }

  let contactId: string | null = String(formData.get("contactId") || "").trim() || null;
  if (contactId) {
    const c = await prisma.contact.findFirst({ where: { id: contactId, organizationId: ctx.orgId }, select: { id: true } });
    contactId = c?.id ?? null;
  }

  if (allocation === ExpenseAllocation.PROJECT && !projectId) {
    return { ok: false as const, error: "בחרו פרויקט לשיוך" };
  }
  if (allocation === ExpenseAllocation.CLIENT && !contactId) {
    return { ok: false as const, error: "בחרו לקוח לשיוך" };
  }
  if (allocation === ExpenseAllocation.OFFICE) {
    projectId = null;
    contactId = null;
  }

  const sourceDocumentId = String(formData.get("sourceDocumentId") || "").trim() || null;
  let resolvedDocId: string | null = null;
  if (sourceDocumentId) {
    const d = await prisma.document.findFirst({
      where: { id: sourceDocumentId, organizationId: ctx.orgId },
      select: { id: true },
    });
    resolvedDocId = d?.id ?? null;
  }

  await prisma.expenseRecord.create({
    data: {
      organizationId: ctx.orgId,
      vendorName,
      invoiceNumber,
      expenseDate,
      description,
      amountNet,
      vat,
      total,
      allocation,
      projectId,
      contactId,
      status,
      sourceDocumentId: resolvedDocId,
    },
  });

  revalidateFinance();
  return { ok: true as const };
}

export async function updateExpenseAction(formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false as const, error: "חסר מזהה הוצאה" };

  const row = await prisma.expenseRecord.findFirst({
    where: { id, organizationId: ctx.orgId },
  });
  if (!row) return { ok: false as const, error: "הוצאה לא נמצאה" };

  const vendorName = String(formData.get("vendorName") || "").trim();
  if (!vendorName) return { ok: false as const, error: "יש להזין שם ספק" };

  const amountNet = parseFloat(String(formData.get("amountNet") || "0"));
  if (!Number.isFinite(amountNet) || amountNet < 0) {
    return { ok: false as const, error: "סכום לפני מע״מ לא תקין" };
  }

  const vat = parseFloat(String(formData.get("vat") || "0")) || 0;
  const totalRaw = parseFloat(String(formData.get("total") || ""));
  const total =
    Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : Math.round((amountNet + vat) * 100) / 100;
  const allocation = parseAllocation(String(formData.get("allocation") || "OFFICE"));
  const status = parseStatus(String(formData.get("status") || "POSTED"));
  const expenseDateRaw = String(formData.get("expenseDate") || "").trim();
  const expenseDate = expenseDateRaw ? new Date(`${expenseDateRaw}T12:00:00`) : row.expenseDate;
  const invoiceNumber = String(formData.get("invoiceNumber") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;

  let projectId: string | null = String(formData.get("projectId") || "").trim() || null;
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, organizationId: ctx.orgId }, select: { id: true } });
    projectId = p?.id ?? null;
  }

  let contactId: string | null = String(formData.get("contactId") || "").trim() || null;
  if (contactId) {
    const c = await prisma.contact.findFirst({ where: { id: contactId, organizationId: ctx.orgId }, select: { id: true } });
    contactId = c?.id ?? null;
  }

  if (allocation === ExpenseAllocation.PROJECT && !projectId) {
    return { ok: false as const, error: "בחרו פרויקט לשיוך" };
  }
  if (allocation === ExpenseAllocation.CLIENT && !contactId) {
    return { ok: false as const, error: "בחרו לקוח לשיוך" };
  }
  if (allocation === ExpenseAllocation.OFFICE) {
    projectId = null;
    contactId = null;
  }

  await prisma.expenseRecord.update({
    where: { id },
    data: {
      vendorName,
      invoiceNumber,
      expenseDate,
      description,
      amountNet,
      vat,
      total,
      allocation,
      projectId,
      contactId,
      status,
    },
  });

  revalidateFinance();
  return { ok: true as const };
}

export async function deleteExpenseAction(expenseId: string) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const row = await prisma.expenseRecord.findFirst({
    where: { id: expenseId, organizationId: ctx.orgId },
  });
  if (!row) return { ok: false as const, error: "הוצאה לא נמצאה" };

  await prisma.expenseRecord.delete({ where: { id: expenseId } });
  revalidateFinance();
  return { ok: true as const };
}

/** טיוטה מפענוח AI — JSON אופציונלי לביקורת */
export async function createExpenseDraftFromAiAction(input: {
  vendorName?: string;
  invoiceNumber?: string;
  expenseDate?: string;
  amountNet?: number;
  vat?: number;
  total?: number;
  description?: string;
  aiExtractedJson?: object;
}) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const vendorName = (input.vendorName ?? "").trim() || "ספק (השלימו)";
  const amountNet = typeof input.amountNet === "number" && Number.isFinite(input.amountNet) ? input.amountNet : 0;
  const vat = typeof input.vat === "number" && Number.isFinite(input.vat) ? input.vat : 0;
  const total =
    typeof input.total === "number" && Number.isFinite(input.total) ? input.total : Math.round((amountNet + vat) * 100) / 100;

  const expenseDate = input.expenseDate
    ? new Date(`${input.expenseDate}T12:00:00`)
    : new Date();

  const created = await prisma.expenseRecord.create({
    data: {
      organizationId: ctx.orgId,
      vendorName,
      invoiceNumber: input.invoiceNumber?.trim() || null,
      expenseDate,
      description: input.description?.trim() || null,
      amountNet,
      vat,
      total,
      allocation: ExpenseAllocation.OFFICE,
      status: ExpenseRecordStatus.DRAFT,
      aiExtractedJson: input.aiExtractedJson ? (input.aiExtractedJson as object) : undefined,
    },
  });

  revalidateFinance();
  return { ok: true as const, id: created.id };
}
