import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { documentTypeLabel } from "@/lib/document-types";
import { formatVatPercent } from "@/lib/vat-config";
import { resolvePdfFontDir } from "@/lib/pdf/resolve-pdf-font-dir";

function money(n: number): string {
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);
  });
}

/** ייצוא PDF בעברית — pdfkit (יציב ב-Vercel serverless) */
export async function renderInvoicePdfWithPdfKit(
  payload: InvoiceExportPayload,
): Promise<Uint8Array> {
  const fontDir = resolvePdfFontDir();
  const regular = path.join(fontDir, "NotoSansHebrew-Regular.ttf");
  const bold = path.join(fontDir, "NotoSansHebrew-Bold.ttf");

  if (!fs.existsSync(regular) || !fs.existsSync(bold)) {
    throw new Error(`PDF font files missing under ${fontDir}`);
  }

  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const done = streamToBuffer(doc);

  doc.registerFont("Hebrew", regular);
  doc.registerFont("Hebrew-Bold", bold);

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rightX = doc.page.width - doc.page.margins.right;
  let y = doc.page.margins.top;

  const title = documentTypeLabel(payload.type);
  const vatPct = formatVatPercent(payload.vatRatePercent);

  // כותרת
  doc.rect(doc.page.margins.left, y, pageW, 52).fill("#4f46e5");
  doc.fillColor("#ffffff").font("Hebrew-Bold").fontSize(18);
  doc.text(title, doc.page.margins.left + 12, y + 10, { width: pageW - 24, align: "right" });
  doc.font("Hebrew").fontSize(10).fillColor("#c7d2fe");
  doc.text(
    `${payload.orgName ?? "BSD-YBM"} · מס׳ ${payload.number}`,
    doc.page.margins.left + 12,
    y + 32,
    { width: pageW - 24, align: "right" },
  );
  y += 64;

  doc.fillColor("#0f172a").font("Hebrew").fontSize(10);
  const colW = (pageW - 12) / 2;
  doc.font("Hebrew-Bold").text("מאת", doc.page.margins.left, y, { width: colW, align: "right" });
  doc.text("לכבוד", doc.page.margins.left + colW + 12, y, { width: colW, align: "right" });
  y += 14;
  doc.font("Hebrew-Bold").fontSize(11);
  doc.text(payload.orgName ?? "—", doc.page.margins.left, y, { width: colW, align: "right" });
  doc.text(payload.clientName, doc.page.margins.left + colW + 12, y, { width: colW, align: "right" });
  y += 16;
  doc.font("Hebrew").fontSize(9).fillColor("#64748b");
  if (payload.orgTaxId) {
    doc.text(`ח.פ / ע.מ: ${payload.orgTaxId}`, doc.page.margins.left, y, { width: colW, align: "right" });
  }
  doc.text(`תאריך: ${payload.date}`, doc.page.margins.left + colW + 12, y, {
    width: colW,
    align: "right",
  });
  y += payload.dueDate ? 22 : 14;
  if (payload.dueDate) {
    doc.text(`לתשלום עד: ${payload.dueDate}`, doc.page.margins.left + colW + 12, y, {
      width: colW,
      align: "right",
    });
    y += 14;
  }

  y += 8;
  const cols = [
    { label: "תיאור", w: pageW * 0.42 },
    { label: "כמות", w: pageW * 0.14 },
    { label: "מחיר", w: pageW * 0.22 },
    { label: "סה״כ", w: pageW * 0.22 },
  ];
  let x = rightX;
  doc.font("Hebrew-Bold").fontSize(9).fillColor("#64748b");
  for (const col of cols) {
    x -= col.w;
    doc.text(col.label, x, y, { width: col.w - 4, align: "center" });
  }
  y += 18;

  doc.font("Hebrew").fontSize(10).fillColor("#0f172a");
  for (const item of payload.items) {
    x = rightX;
    const row = [
      item.desc,
      String(item.qty),
      money(item.price),
      money(item.qty * item.price),
    ];
    for (let i = 0; i < cols.length; i++) {
      x -= cols[i].w;
      doc.text(row[i], x, y, {
        width: cols[i].w - 4,
        align: i === 0 ? "right" : "center",
      });
    }
    y += 18;
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  }

  y += 10;
  const totalsW = pageW * 0.45;
  const totalsX = doc.page.margins.left;
  doc.rect(totalsX, y, totalsW, 72).stroke("#e2e8f0");
  y += 10;
  const line = (label: string, value: string, bold = false) => {
    doc.font(bold ? "Hebrew-Bold" : "Hebrew")
      .fontSize(bold ? 12 : 10)
      .fillColor(bold ? "#4f46e5" : "#0f172a");
    doc.text(label, totalsX + 8, y, { width: totalsW * 0.55, align: "right" });
    doc.text(value, totalsX + totalsW * 0.45, y, { width: totalsW * 0.45, align: "left" });
    y += bold ? 20 : 16;
  };
  line("סכום לפני מע״מ", money(payload.amount));
  line(`מע״מ (${vatPct}%)`, money(payload.vat));
  line("סה״כ לתשלום", money(payload.total), true);

  if (payload.itaAllocationNumber) {
    y += 4;
    doc.font("Hebrew-Bold").fontSize(9).fillColor("#4f46e5");
    doc.text(`מספר הקצאה (רשות המסים): ${payload.itaAllocationNumber}`, doc.page.margins.left, y, {
      width: pageW,
      align: "right",
    });
  }

  doc.font("Hebrew").fontSize(8).fillColor("#94a3b8");
  doc.text(
    "מסמך הופק במערכת BSD-YBM-OS · אין לראות במסמך זה כקבלה אלא אם צוין במפורש",
    doc.page.margins.left,
    doc.page.height - 50,
    { width: pageW, align: "center" },
  );

  doc.end();
  return done;
}
