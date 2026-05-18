import fs from "node:fs";
import { buildInvoicePdfBuffer } from "../lib/invoice-export.ts";

const payload = {
  type: "QUOTE",
  number: 1012,
  date: "18/05/2026",
  dueDate: null,
  clientName: "יוחנן בוקשפן",
  orgName: "BSD-YBM",
  orgTaxId: "5166669029",
  orgAddress: null,
  vatRatePercent: 18,
  amount: 852,
  vat: 0,
  total: 852,
  items: [{ desc: "שירות ייעוץ", qty: 1, price: 852 }],
  itaAllocationNumber: null,
  paypalEmail: null,
};

const buf = await buildInvoicePdfBuffer(payload);
fs.writeFileSync("test-invoice-hebrew.pdf", buf);
console.log("pdf_ok", buf.length, String.fromCharCode(...buf.slice(0, 5)));
