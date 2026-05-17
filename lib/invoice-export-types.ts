export type InvoiceLineItem = { desc: string; qty: number; price: number };

export type InvoiceExportPayload = {
  type: string;
  number: number;
  clientName: string;
  date: string;
  amount: number;
  vat: number;
  total: number;
  items: InvoiceLineItem[];
  orgName?: string;
  orgTaxId?: string;
};
