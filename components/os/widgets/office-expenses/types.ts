import type { FinanceExpenseRow } from "@/lib/finance-workspace-types";

export type OfficeExpenseFormState = {
  vendorName: string;
  invoiceNumber: string;
  expenseDate: string;
  description: string;
  amountNet: string;
  vat: string;
  status: "DRAFT" | "POSTED";
};

export const emptyOfficeExpenseForm = (): OfficeExpenseFormState => ({
  vendorName: "",
  invoiceNumber: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  description: "",
  amountNet: "",
  vat: "0",
  status: "POSTED",
});

export function officeExpenseFormFromRow(row: FinanceExpenseRow): OfficeExpenseFormState {
  return {
    vendorName: row.vendorName,
    invoiceNumber: row.invoiceNumber ?? "",
    expenseDate: row.expenseDate.slice(0, 10),
    description: row.description ?? "",
    amountNet: String(row.amountNet),
    vat: String(row.vat),
    status: row.status === "DRAFT" ? "DRAFT" : "POSTED",
  };
}

export function officeExpensePayloadFromForm(form: OfficeExpenseFormState) {
  const amountNet = parseFloat(form.amountNet);
  const vat = parseFloat(form.vat || "0");
  const total = Math.round((amountNet + (Number.isFinite(vat) ? vat : 0)) * 100) / 100;
  return {
    vendorName: form.vendorName.trim(),
    invoiceNumber: form.invoiceNumber.trim() || null,
    expenseDate: form.expenseDate,
    description: form.description.trim() || null,
    amountNet,
    vat: Number.isFinite(vat) ? vat : 0,
    total,
    status: form.status,
  };
}

export const officeExpenseNis = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
