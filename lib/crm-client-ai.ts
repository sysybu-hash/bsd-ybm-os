/** טיפוסים לניתוח לקוח ב-CRM — מחוץ ל־"use server" */

export type ClientAiTableRow = {
  id: string;
  date: string;
  label: string;
  amountGross: number;
  status: string;
};

export type ClientAiSuccess = {
  ok: true;
  summary: string;
  alerts: string[];
  recommendation: string;
  tableData: ClientAiTableRow[];
};

export type ClientAiResult = ClientAiSuccess | { ok: false; error: string };

export function buildTableDataFromInvoices(
  invoices: {
    id: string;
    amount: number | null;
    status: string;
    description: string | null;
    paidAt: Date | null;
    createdAt: Date;
  }[],
): ClientAiTableRow[] {
  return invoices.map((inv) => {
    const gross = inv.amount ?? 0;
    const d = inv.paidAt ?? inv.createdAt;
    return {
      id: inv.id,
      date: d.toISOString().slice(0, 10),
      label: inv.description?.trim() || `חשבונית · ${inv.status}`,
      amountGross: gross,
      status: inv.status,
    };
  });
}
