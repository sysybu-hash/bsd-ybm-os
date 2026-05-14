"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { DocStatus, DocType } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateIssuedDocumentTotals } from "@/lib/billing-calculations";

export type CreateIssuedDocumentInput = {
  type: DocType;
  clientName: string;
  netAmount: number;
  items: unknown;
};

export type CreateIssuedDocumentResult =
  | { ok: true; docNumber: number }
  | { ok: false; error: string };

export async function createIssuedDocument(
  data: CreateIssuedDocumentInput,
): Promise<CreateIssuedDocumentResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, error: "׳™׳© ׳׳”׳×׳—׳‘׳¨ ׳׳׳¢׳¨׳›׳×." };
  }
  if (!session.user.organizationId) {
    return { ok: false, error: "׳׳ ׳ ׳׳¦׳ ׳׳¨׳’׳•׳ ׳׳©׳•׳™׳." };
  }

  const orgId = session.user.organizationId;

  const clientName = data.clientName.trim();
  if (clientName.length < 1) {
    return { ok: false, error: "׳ ׳ ׳׳׳׳ ׳©׳ ׳׳§׳•׳—." };
  }

  if (!Object.values(DocType).includes(data.type)) {
    return { ok: false, error: "׳¡׳•׳’ ׳׳¡׳׳ ׳׳ ׳×׳§׳™׳." };
  }

  const netAmount = Number(data.netAmount);
  if (!Number.isFinite(netAmount) || netAmount < 0) {
    return { ok: false, error: "׳¡׳›׳•׳ ׳׳₪׳ ׳™ ׳׳¢׳´׳ ׳׳ ׳×׳§׳™׳." };
  }

  const itemsJson: Prisma.InputJsonValue = Array.isArray(data.items)
    ? (data.items as Prisma.InputJsonValue)
    : [];

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { companyType: true, isReportable: true },
  });

  if (!org) {
    return { ok: false, error: "׳”׳׳¨׳’׳•׳ ׳׳ ׳ ׳׳¦׳." };
  }

  const { vat, total } = calculateIssuedDocumentTotals(
    netAmount,
    org.companyType,
    org.isReportable,
  );

  const lastDoc = await prisma.issuedDocument.findFirst({
    where: { organizationId: orgId, type: data.type },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const nextNumber = (lastDoc?.number ?? 1000) + 1;

  try {
    const newDoc = await prisma.issuedDocument.create({
      data: {
        organizationId: orgId,
        type: data.type,
        number: nextNumber,
        clientName,
        amount: netAmount,
        vat,
        total,
        items: itemsJson,
        status: DocStatus.PENDING,
      },
    });

revalidatePath("/app/settings/billing");
    return { ok: true, docNumber: newDoc.number };
  } catch (e) {
    console.error("createIssuedDocument", e);
    return { ok: false, error: "׳©׳׳™׳¨׳× ׳”׳׳¡׳׳ ׳ ׳›׳©׳׳”." };
  }
}

/* ג”€ג”€ג”€ Update existing issued document ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */

export type UpdateIssuedDocumentInput = {
  id: string;
  type: DocType;
  clientName: string;
  netAmount: number;
  items: unknown;
  status: DocStatus;
};

export type UpdateIssuedDocumentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateIssuedDocument(
  data: UpdateIssuedDocumentInput,
): Promise<UpdateIssuedDocumentResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return { ok: false, error: "׳™׳© ׳׳”׳×׳—׳‘׳¨ ׳׳׳¢׳¨׳›׳×." };
  }
  const orgId = session.user.organizationId;

  const clientName = data.clientName.trim();
  if (!clientName) return { ok: false, error: "׳ ׳ ׳׳׳׳ ׳©׳ ׳׳§׳•׳—." };
  if (!Object.values(DocType).includes(data.type)) return { ok: false, error: "׳¡׳•׳’ ׳׳¡׳׳ ׳׳ ׳×׳§׳™׳." };
  if (!Object.values(DocStatus).includes(data.status)) return { ok: false, error: "׳¡׳˜׳˜׳•׳¡ ׳׳ ׳×׳§׳™׳." };

  const netAmount = Number(data.netAmount);
  if (!Number.isFinite(netAmount) || netAmount < 0) return { ok: false, error: "׳¡׳›׳•׳ ׳׳ ׳×׳§׳™׳." };

  const doc = await prisma.issuedDocument.findFirst({
    where: { id: data.id, organizationId: orgId },
    select: { id: true },
  });
  if (!doc) return { ok: false, error: "׳׳¡׳׳ ׳׳ ׳ ׳׳¦׳." };

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { companyType: true, isReportable: true },
  });
  if (!org) return { ok: false, error: "׳׳¨׳’׳•׳ ׳׳ ׳ ׳׳¦׳." };

  const { vat, total } = calculateIssuedDocumentTotals(netAmount, org.companyType, org.isReportable);
  const itemsJson: Prisma.InputJsonValue = Array.isArray(data.items) ? (data.items as Prisma.InputJsonValue) : [];

  try {
    await prisma.issuedDocument.update({
      where: { id: data.id },
      data: { type: data.type, clientName, amount: netAmount, vat, total, items: itemsJson, status: data.status },
    });
revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch (e) {
    console.error("updateIssuedDocument", e);
    return { ok: false, error: "׳¢׳“׳›׳•׳ ׳”׳׳¡׳׳ ׳ ׳›׳©׳." };
  }
}

/* ג”€ג”€ג”€ Delete issued document ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */

export type DeleteIssuedDocumentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteIssuedDocument(id: string): Promise<DeleteIssuedDocumentResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return { ok: false, error: "׳™׳© ׳׳”׳×׳—׳‘׳¨." };
  const orgId = session.user.organizationId;

  const doc = await prisma.issuedDocument.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!doc) return { ok: false, error: "׳׳¡׳׳ ׳׳ ׳ ׳׳¦׳." };

  try {
    await prisma.issuedDocument.delete({ where: { id } });
revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch (e) {
    console.error("deleteIssuedDocument", e);
    return { ok: false, error: "׳׳—׳™׳§׳× ׳”׳׳¡׳׳ ׳ ׳›׳©׳׳”." };
  }
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type ExportMonthlyReportResult =
  | { ok: true; csv: string; fileName: string }
  | { ok: false; error: string };

export async function exportMonthlyReport(
  month: number,
  year: number,
): Promise<ExportMonthlyReportResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return { ok: false, error: "׳’׳™׳©׳” ׳ ׳“׳—׳×׳”" };
  }

  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return { ok: false, error: "׳—׳•׳“׳© ׳׳ ׳×׳§׳™׳" };
  }
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return { ok: false, error: "׳©׳ ׳” ׳׳ ׳×׳§׳™׳ ׳”" };
  }

  const startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(y, m, 0, 23, 59, 59, 999);

  const docs = await prisma.issuedDocument.findMany({
    where: {
      organizationId: session.user.organizationId,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { number: "asc" },
  });

  if (docs.length === 0) {
    return { ok: false, error: "׳׳ ׳ ׳׳¦׳׳• ׳׳¡׳׳›׳™׳ ׳׳—׳•׳“׳© ׳–׳”" };
  }

  const headers = ["׳׳¡׳₪׳¨", "׳×׳׳¨׳™׳", "׳׳§׳•׳—", "׳¡׳•׳’", "׳ ׳˜׳•", "׳׳¢׳´׳", "׳¡׳”׳´׳›", "׳¡׳˜׳˜׳•׳¡"];
  const csvRows = docs.map((d) => [
    csvCell(d.number),
    csvCell(new Date(d.date).toLocaleDateString("he-IL")),
    csvCell(d.clientName),
    csvCell(d.type),
    csvCell(d.amount.toFixed(2)),
    csvCell(d.vat.toFixed(2)),
    csvCell(d.total.toFixed(2)),
    csvCell(d.status),
  ]);

  const csvContent = [headers.map(csvCell).join(","), ...csvRows.map((r) => r.join(","))].join(
    "\n",
  );

  return {
    ok: true,
    csv: csvContent,
    fileName: `BSD-YBM-Report-${m}-${y}.csv`,
  };
}

