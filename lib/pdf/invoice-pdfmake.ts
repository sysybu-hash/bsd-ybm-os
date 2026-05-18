import path from "node:path";
import { createRequire } from "node:module";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { documentTypeLabel } from "@/lib/document-types";
import { formatVatPercent } from "@/lib/vat-config";
import {
  loadPdfFontBuffers,
  PDF_FONT_VFS_KEYS,
} from "@/lib/pdf/load-pdf-font-buffers";

type PdfMakeInstance = {
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
  setFonts: (fonts: Record<string, { normal: string; bold: string }>) => void;
  setLocalAccessPolicy: (fn: (p: string) => boolean) => void;
  createPdf: (def: TDocumentDefinitions) => { getBuffer: () => Promise<Buffer> };
};

let pdfMakeSingleton: PdfMakeInstance | null = null;

/** טעינה עצלה — מונעת שבירת `next build` כש-Next סורק מודולי API */
function getPdfMake(): PdfMakeInstance {
  if (pdfMakeSingleton) return pdfMakeSingleton;
  const requirePdfMake = createRequire(path.join(process.cwd(), "package.json"));
  const mod = requirePdfMake("pdfmake") as PdfMakeInstance & { default?: PdfMakeInstance };
  const instance =
    mod && typeof mod.createPdf === "function"
      ? mod
      : mod?.default && typeof mod.default.createPdf === "function"
        ? mod.default
        : null;
  if (!instance) {
    throw new Error("pdfmake failed to load (missing createPdf)");
  }
  pdfMakeSingleton = instance;
  return instance;
}

const INDIGO = "#4f46e5";
const INDIGO_LIGHT = "#c7d2fe";
const SLATE = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

let fontsReady = false;

function ensureFonts(): void {
  if (fontsReady) return;
  const pdfmake = getPdfMake();
  const { regular, bold } = loadPdfFontBuffers();
  pdfmake.virtualfs.writeFileSync(PDF_FONT_VFS_KEYS.regular, regular);
  pdfmake.virtualfs.writeFileSync(PDF_FONT_VFS_KEYS.bold, bold);
  pdfmake.setFonts({
    NotoHebrew: {
      normal: PDF_FONT_VFS_KEYS.regular,
      bold: PDF_FONT_VFS_KEYS.bold,
    },
  });
  pdfmake.setLocalAccessPolicy(() => false);
  fontsReady = true;
}

function money(n: number): string {
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildDocDefinition(payload: InvoiceExportPayload): TDocumentDefinitions {
  const title = documentTypeLabel(payload.type);
  const vatPct = formatVatPercent(payload.vatRatePercent);

  const itemRows: Content[][] = [
    [
      { text: "תיאור", style: "th", alignment: "right" },
      { text: "כמות", style: "th", alignment: "center" },
      { text: "מחיר", style: "th", alignment: "center" },
      { text: "סה״כ", style: "th", alignment: "left" },
    ],
    ...payload.items.map(
      (item): Content[] => [
        { text: item.desc || "—", alignment: "right" },
        { text: String(item.qty), alignment: "center" },
        { text: money(item.price), alignment: "center" },
        { text: money(item.qty * item.price), alignment: "left", bold: true },
      ],
    ),
  ];

  if (payload.items.length === 0) {
    itemRows.push([
      {
        text: "אין פריטים",
        colSpan: 4,
        alignment: "center",
        color: MUTED,
        margin: [0, 8, 0, 8],
      } as Content,
      {} as Content,
      {} as Content,
      {} as Content,
    ]);
  }

  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 48],
    defaultStyle: {
      font: "NotoHebrew",
      fontSize: 10,
      color: SLATE,
      alignment: "right",
    },
    styles: {
      headerTitle: { fontSize: 20, bold: true, color: "#ffffff", alignment: "right" },
      headerSub: { fontSize: 10, color: INDIGO_LIGHT, alignment: "right", margin: [0, 4, 0, 0] },
      boxLabel: { fontSize: 8, color: MUTED, bold: true, margin: [0, 0, 0, 4] },
      boxValue: { fontSize: 11, bold: true },
      boxMeta: { fontSize: 9, color: MUTED, margin: [0, 2, 0, 0] },
      th: { fontSize: 9, bold: true, color: MUTED, fillColor: "#f1f5f9" },
      totalLabel: { color: MUTED },
      totalValue: {},
      grandLabel: { fontSize: 13, bold: true, color: INDIGO },
      grandValue: { fontSize: 13, bold: true, color: INDIGO },
      footer: { fontSize: 8, color: "#94a3b8", alignment: "center" },
      allocation: { fontSize: 9, bold: true, color: INDIGO, margin: [0, 12, 0, 0] },
    },
    content: [
      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  { text: title, style: "headerTitle" },
                  {
                    text: `${payload.orgName ?? "BSD-YBM"} · מס׳ ${payload.number}`,
                    style: "headerSub",
                  },
                ],
                fillColor: INDIGO,
                margin: [16, 14, 16, 14],
              },
            ],
          ],
        },
        layout: "noBorders",
        margin: [0, 0, 0, 16],
      },
      {
        columns: [
          {
            width: "48%",
            table: {
              widths: ["*"],
              body: [
                [{ text: "מאת", style: "boxLabel", border: [false, false, false, false] }],
                [
                  {
                    text: payload.orgName ?? "—",
                    style: "boxValue",
                    border: [false, false, false, false],
                  },
                ],
                ...(payload.orgTaxId
                  ? [
                      [
                        {
                          text: `ח.פ / ע.מ: ${payload.orgTaxId}`,
                          style: "boxMeta",
                          border: [false, false, false, false],
                        },
                      ],
                    ]
                  : []),
              ],
            },
            layout: {
              hLineWidth: () => 1,
              vLineWidth: () => 1,
              hLineColor: () => BORDER,
              vLineColor: () => BORDER,
              paddingLeft: () => 10,
              paddingRight: () => 10,
              paddingTop: () => 10,
              paddingBottom: () => 10,
            },
          },
          { width: 12, text: "" },
          {
            width: "48%",
            table: {
              widths: ["*"],
              body: [
                [{ text: "לכבוד", style: "boxLabel", border: [false, false, false, false] }],
                [
                  {
                    text: payload.clientName,
                    style: "boxValue",
                    border: [false, false, false, false],
                  },
                ],
                [
                  {
                    text: `תאריך: ${payload.date}`,
                    style: "boxMeta",
                    border: [false, false, false, false],
                  },
                ],
                ...(payload.dueDate
                  ? [
                      [
                        {
                          text: `לתשלום עד: ${payload.dueDate}`,
                          style: "boxMeta",
                          border: [false, false, false, false],
                        },
                      ],
                    ]
                  : []),
              ],
            },
            layout: {
              hLineWidth: () => 1,
              vLineWidth: () => 1,
              hLineColor: () => BORDER,
              vLineColor: () => BORDER,
              paddingLeft: () => 10,
              paddingRight: () => 10,
              paddingTop: () => 10,
              paddingBottom: () => 10,
            },
          },
        ],
        margin: [0, 0, 0, 16],
      },
      {
        table: {
          widths: ["42%", "14%", "22%", "22%"],
          body: itemRows,
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === node.table.body.length ? 0 : 1,
          vLineWidth: () => 0,
          hLineColor: () => BORDER,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
        margin: [0, 0, 0, 14],
      },
      {
        columns: [
          { width: "*", text: "" },
          {
            width: 220,
            table: {
              widths: ["*", "auto"],
              body: [
                [
                  { text: "לפני מע״מ", style: "totalLabel" },
                  { text: money(payload.amount), style: "totalValue", alignment: "left" },
                ],
                [
                  { text: `מע״מ (${vatPct}%)`, style: "totalLabel" },
                  { text: money(payload.vat), style: "totalValue", alignment: "left" },
                ],
                [
                  { text: "סה״כ לתשלום", style: "grandLabel" },
                  { text: money(payload.total), style: "grandValue", alignment: "left" },
                ],
              ],
            },
            layout: {
              hLineWidth: (i: number) => (i === 2 ? 1 : 0),
              vLineWidth: () => 0,
              hLineColor: () => BORDER,
              paddingLeft: () => 10,
              paddingRight: () => 10,
              paddingTop: () => 6,
              paddingBottom: () => 6,
            },
          },
        ],
      },
      ...(payload.itaAllocationNumber
        ? [
            {
              text: `מספר הקצאה (רשות המסים): ${payload.itaAllocationNumber}`,
              style: "allocation",
            } as Content,
          ]
        : []),
      {
        text: "מסמך הופק במערכת BSD-YBM-OS · אין לראות במסמך זה כקבלה אלא אם צוין במפורש",
        style: "footer",
        margin: [0, 24, 0, 0],
      },
    ],
  } as TDocumentDefinitions;
}

/** PDF מעוצב בעברית RTL — pdfmake (יציב ב-Vercel serverless) */
export async function renderInvoicePdfWithPdfMake(
  payload: InvoiceExportPayload,
): Promise<Uint8Array> {
  ensureFonts();
  const pdfDoc = getPdfMake().createPdf(buildDocDefinition(payload));
  const buffer = await pdfDoc.getBuffer();
  return new Uint8Array(buffer);
}
