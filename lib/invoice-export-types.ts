export type InvoiceLineItem = { desc: string; qty: number; price: number };

export type InvoiceExportPayload = {
  type: string;
  number: number;
  clientName: string;
  date: string;
  dueDate?: string;
  amount: number;
  vat: number;
  total: number;
  vatRatePercent: number;
  items: InvoiceLineItem[];
  orgName?: string;
  orgTaxId?: string;
  /** שורת מזהה מס מעוצבת, למשל "ח.פ: 123456789" */
  orgTaxIdLine?: string;
  orgEmail?: string;
  orgAddress?: string;
  itaAllocationNumber?: string | null;
  paymentNote?: string;
};
