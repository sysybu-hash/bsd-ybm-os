/**
 * CSV exporters for Israeli accounting software (Priority / חשבשבת import).
 */

import {
  AccountingExporter,
  registerAccountingExporter,
  type AccountingExportRequest,
  type AccountingExportResult,
  type AccountingDocument,
  type AccountingExpense,
} from "./accounting-exporter";

function escapeCsv(value: string): string {
  const v = value.replace(/"/g, '""');
  return /[",\n\r]/.test(v) ? `"${v}"` : v;
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function buildDocumentRows(docs: AccountingDocument[]): string[] {
  const header =
    "doc_type,doc_number,date,due_date,customer_name,customer_tax_id,total,vat,currency,line_description,quantity,unit_price,line_total";
  const rows = [header];
  for (const doc of docs) {
    if (doc.lineItems.length === 0) {
      rows.push(
        [
          doc.docType,
          doc.docNumber ?? "",
          formatDate(doc.date),
          formatDate(doc.dueDate ?? null),
          doc.customerName,
          doc.customerTaxId ?? "",
          String(doc.total),
          String(doc.vatAmount ?? 0),
          doc.currency,
          "",
          "",
          "",
          "",
        ]
          .map(escapeCsv)
          .join(","),
      );
      continue;
    }
    for (const item of doc.lineItems) {
      rows.push(
        [
          doc.docType,
          doc.docNumber ?? "",
          formatDate(doc.date),
          formatDate(doc.dueDate ?? null),
          doc.customerName,
          doc.customerTaxId ?? "",
          String(doc.total),
          String(doc.vatAmount ?? 0),
          doc.currency,
          item.description,
          String(item.quantity),
          String(item.unitPrice),
          String(item.lineTotal),
        ]
          .map(escapeCsv)
          .join(","),
      );
    }
  }
  return rows;
}

function buildExpenseRows(expenses: AccountingExpense[]): string[] {
  const header = "expense_date,vendor_name,vendor_tax_id,total,vat,description,category";
  const rows = [header];
  for (const e of expenses) {
    rows.push(
      [
        formatDate(e.date),
        e.vendorName,
        e.vendorTaxId ?? "",
        String(e.total),
        String(e.vatAmount ?? 0),
        e.description ?? "",
        e.category ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return rows;
}

abstract class CsvAccountingExporter extends AccountingExporter {
  abstract readonly systemName: string;
  readonly mimeType = "text/csv; charset=utf-8";
  readonly fileExtension = "csv";

  async export(request: AccountingExportRequest): Promise<AccountingExportResult> {
    const lines: string[] = [
      `# BSD-YBM export — ${this.systemName}`,
      `# org: ${request.organizationName}`,
      `# from: ${formatDate(request.fromDate)} to: ${formatDate(request.toDate)}`,
      "",
    ];
    if (request.documents?.length) {
      lines.push(...buildDocumentRows(request.documents), "");
    }
    if (request.expenses?.length) {
      lines.push(...buildExpenseRows(request.expenses));
    }

    const content = Buffer.from(lines.join("\n"), "utf8");
    const slug = request.organizationName.replace(/[^\w\u0590-\u05FF]+/g, "_").slice(0, 40);
    return {
      fileName: `${this.systemName}_${slug}_${formatDate(request.fromDate)}_${formatDate(request.toDate)}.csv`,
      mimeType: this.mimeType,
      content,
      summary: this.buildSummary(request),
    };
  }
}

export class PriorityCsvExporter extends CsvAccountingExporter {
  readonly systemName = "priority";
}

export class HashavshevetCsvExporter extends CsvAccountingExporter {
  readonly systemName = "hashavshevet";
}

export const priorityCsvExporter = new PriorityCsvExporter();
export const hashavshevetCsvExporter = new HashavshevetCsvExporter();
registerAccountingExporter(priorityCsvExporter);
registerAccountingExporter(hashavshevetCsvExporter);
