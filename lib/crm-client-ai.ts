/** טיפוסים וחישובי PayPlus לניתוח CRM — מחוץ ל־"use server" */

export type ClientAiTableRow = {
  id: string;
  date: string;
  label: string;
  amountGross: number;
  feePayPlus: number;
  net: number;
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

/** עמלת PayPlus לעסקה: 1.2% + 1.2 ₪ */
export function payPlusFeeIls(gross: number): { fee: number; net: number } {
  const fee = Math.round((gross * 0.012 + 1.2) * 100) / 100;
  const net = Math.round((gross - fee) * 100) / 100;
  return { fee, net };
}

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
    const { fee, net } = payPlusFeeIls(gross);
    const d = inv.paidAt ?? inv.createdAt;
    return {
      id: inv.id,
      date: d.toISOString().slice(0, 10),
      label: inv.description?.trim() || `חשבונית · ${inv.status}`,
      amountGross: gross,
      feePayPlus: fee,
      net,
      status: inv.status,
    };
  });
}
