import { buildInvoicePdfBuffer } from "../lib/invoice-export.ts";

const payload = {
  type: "QUOTE",
  number: 1012,
  date: "18/05/2026",
  dueDate: null,
  clientName: "יוחנן בוקשפן",
  orgName: "BSD-YBM",
  orgTaxId: "123",
  orgAddress: null,
  vatRatePercent: 18,
  amount: 852,
  vat: 0,
  total: 852,
  items: [{ desc: "בדיקה", qty: 1, price: 852 }],
  itaAllocationNumber: null,
  paypalEmail: null,
};

try {
  const buf = await buildInvoicePdfBuffer(payload);
  console.log("pdf_ok", buf.length, "bytes");
} catch (e) {
  console.error("pdf_fail", e?.message ?? e);
  process.exitCode = 1;
}
