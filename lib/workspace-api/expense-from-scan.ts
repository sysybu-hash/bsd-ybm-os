import { ExpenseAllocation, ExpenseRecordStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { FinanceExpenseRow } from "@/lib/finance-workspace-types";
import {
  logOfficeExpenseAudit,
  officeExpenseAuditDetails,
} from "@/lib/office-expenses-audit";

const DEFAULT_VAT_RATE = 0.17;

function parseExpenseDate(raw: string | undefined): Date {
  if (raw?.trim()) {
    const parsed = new Date(raw.trim());
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return new Date(`${raw.trim()}T12:00:00`);
  }
  return new Date();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseExpenseAmountsFromV5(v5: ScanExtractionV5): {
  amountNet: number;
  vat: number;
  total: number;
} {
  const headerTotal = v5.total ?? 0;

  if (v5.lineItems.length > 0) {
    let amountNet = 0;
    let vat = 0;
    for (const line of v5.lineItems) {
      const lineNet =
        line.lineTotal ??
        (line.quantity != null && line.unitPrice != null ? line.quantity * line.unitPrice : 0);
      amountNet += lineNet;
      vat += line.vatAmount ?? 0;
    }
    if (amountNet > 0 || vat > 0) {
      const total = roundMoney(amountNet + vat);
      return { amountNet: roundMoney(amountNet), vat: roundMoney(vat), total: total > 0 ? total : headerTotal };
    }
  }

  if (headerTotal <= 0) {
    return { amountNet: 0, vat: 0, total: 0 };
  }

  const amountNet = roundMoney(headerTotal / (1 + DEFAULT_VAT_RATE));
  const vat = roundMoney(headerTotal - amountNet);
  return { amountNet, vat, total: headerTotal };
}

export function pickInvoiceNumberFromV5(v5: ScanExtractionV5): string | null {
  const docType = v5.docType?.trim();
  if (docType && docType.length <= 80 && /\d/.test(docType)) {
    return docType;
  }
  return null;
}

function mapRow(row: {
  id: string;
  vendorName: string;
  invoiceNumber: string | null;
  description: string | null;
  expenseDate: Date;
  total: number;
  amountNet: number;
  vat: number;
  allocation: string;
  status: string;
  projectId: string | null;
  contactId: string | null;
}): FinanceExpenseRow {
  return {
    id: row.id,
    vendorName: row.vendorName,
    invoiceNumber: row.invoiceNumber,
    description: row.description,
    expenseDate: row.expenseDate.toISOString(),
    total: row.total,
    amountNet: row.amountNet,
    vat: row.vat,
    allocation: row.allocation,
    status: row.status,
    projectId: row.projectId,
    contactId: row.contactId,
    projectName: null,
    contactName: null,
  };
}

export type CreateExpenseFromScanInput = {
  v5: ScanExtractionV5;
  sourceDocumentId: string;
  aiExtractedJson: object;
  projectId?: string | null;
  auditUserId?: string;
};

/** יצירת ExpenseRecord מסריקה — משרד או פרויקט */
export async function createExpenseFromScan(
  orgId: string,
  input: CreateExpenseFromScanInput,
): Promise<FinanceExpenseRow> {
  const { amountNet, vat, total } = parseExpenseAmountsFromV5(input.v5);
  const isProject = Boolean(input.projectId);

  const row = await prisma.expenseRecord.create({
    data: {
      organizationId: orgId,
      vendorName: input.v5.vendor?.trim() || "לא צוין",
      invoiceNumber: pickInvoiceNumberFromV5(input.v5),
      expenseDate: input.v5.date ? parseExpenseDate(input.v5.date) : new Date(),
      description: input.v5.summary?.trim() || null,
      amountNet,
      vat,
      total,
      status: ExpenseRecordStatus.POSTED,
      sourceDocumentId: input.sourceDocumentId,
      aiExtractedJson: input.aiExtractedJson,
      allocation: isProject ? ExpenseAllocation.PROJECT : ExpenseAllocation.OFFICE,
      projectId: input.projectId ?? null,
      contactId: null,
    },
  });

  if (!isProject && input.auditUserId) {
    await logOfficeExpenseAudit(
      input.auditUserId,
      orgId,
      "scan_created",
      officeExpenseAuditDetails({
        id: row.id,
        vendor: row.vendorName,
        total: row.total,
        documentId: input.sourceDocumentId,
      }),
    );
  }

  return mapRow(row);
}
