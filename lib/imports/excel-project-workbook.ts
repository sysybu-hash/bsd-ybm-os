import * as XLSX from "xlsx";

export type ExcelWorkbookKind = "quote" | "account" | "unknown";

export type ParsedBoqLine = {
  sortOrder: number;
  sectionTitle?: string;
  description: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal: number;
  isSectionSubtotal: boolean;
  isWorkDone?: boolean;
  progressCoefficient?: number;
  phases?: Array<{ phaseIndex: number; coefficient?: number; phaseAmount?: number }>;
};

export type ParsedProgressBill = {
  billNumber: number;
  sheetName: string;
  lines: Array<{
    description?: string;
    contractQty?: number;
    unitPrice?: number;
    executedQty?: number;
    executedCoef?: number;
    lineTotal: number;
  }>;
  subtotal: number;
  total: number;
};

export type ParsedExcelProject = {
  kind: ExcelWorkbookKind;
  title: string;
  sourceFileName: string;
  boqLines: ParsedBoqLine[];
  progressBills: ParsedProgressBill[];
  totalAmount: number;
};

function normCell(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function numCell(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function sheetNames(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames ?? [];
}

function detectKind(names: string[]): ExcelWorkbookKind {
  const joined = names.join(" ");
  if (/חשבון\s*\d|הצעת\s*מחיר|חוזה/i.test(joined) && names.length >= 5) return "quote";
  if (/חשבון|כתב\s*כמויות|אבן\s*דרך/i.test(joined) && names.length <= 6) return "account";
  if (names.length >= 10) return "quote";
  if (names.length >= 2 && names.length <= 5) return "account";
  return "unknown";
}

const DESC_KEYS = ["תיאור", "סעיף", "תיאור סעיף", "פריט"];
const UNIT_KEYS = ["יחידה", "יח"];
const QTY_KEYS = ["כמות", "כמות כוללת"];
const PRICE_KEYS = ["מחיר", "מחיר יחידה", "מחיר ליח"];
const TOTAL_KEYS = ['סה"כ', "סהכ", "סכום", "סך הכל"];
const DONE_KEYS = ["האם בוצע", "בוצע"];
const COEF_KEYS = ["מקדם", "מקדם ביצוע"];

function findHeaderRow(rows: unknown[][]): { row: number; map: Record<string, number> } {
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r] ?? [];
    const map: Record<string, number> = {};
    row.forEach((cell, c) => {
      const t = normCell(cell);
      if (!t) return;
      if (DESC_KEYS.some((k) => t.includes(k))) map.description = c;
      if (UNIT_KEYS.some((k) => t === k || t.includes(k))) map.unit = c;
      if (QTY_KEYS.some((k) => t.includes(k))) map.quantity = c;
      if (PRICE_KEYS.some((k) => t.includes(k))) map.unitPrice = c;
      if (TOTAL_KEYS.some((k) => t.includes(k))) map.lineTotal = c;
      if (DONE_KEYS.some((k) => t.includes(k))) map.isWorkDone = c;
      if (COEF_KEYS.some((k) => t.includes(k))) map.progressCoefficient = c;
      if (/אבן\s*דרך\s*(\d+)/i.test(t)) {
        const m = t.match(/(\d+)/);
        if (m) {
          const idx = Number(m[1]);
          if (!map.phases) map.phases = c as unknown as number;
          map[`phase_${idx}`] = c;
        }
      }
    });
    if (map.description != null) return { row: r, map };
  }
  return { row: 2, map: { description: 1, unit: 2, quantity: 3, unitPrice: 4, lineTotal: 5 } };
}

function parseBoqSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedBoqLine[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  const { row: headerRow, map } = findHeaderRow(rows);
  const lines: ParsedBoqLine[] = [];
  let sortOrder = 0;
  let currentSection: string | undefined;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const desc = normCell(row[map.description ?? 1]);
    if (!desc) continue;

    const unit = map.unit != null ? normCell(row[map.unit]) : undefined;
    const quantity = map.quantity != null ? numCell(row[map.quantity]) : undefined;
    const unitPrice = map.unitPrice != null ? numCell(row[map.unitPrice]) : undefined;
    let lineTotal = map.lineTotal != null ? numCell(row[map.lineTotal]) : undefined;
    if (lineTotal == null && quantity != null && unitPrice != null) {
      lineTotal = quantity * unitPrice;
    }
    const isSubtotal =
      /סה"כ|סיכום|סהכ/i.test(desc) && (quantity == null || quantity === 0);
    if (isSubtotal) currentSection = desc;

    const isWorkDone =
      map.isWorkDone != null
        ? ["כן", "yes", "true", "1", "v"].includes(normCell(row[map.isWorkDone]).toLowerCase())
        : undefined;
    const progressCoefficient =
      map.progressCoefficient != null ? numCell(row[map.progressCoefficient]) : undefined;

    const phases: ParsedBoqLine["phases"] = [];
    for (let p = 2; p <= 9; p++) {
      const col = map[`phase_${p}`];
      if (col == null) continue;
      const coef = numCell(row[col]);
      if (coef != null) phases.push({ phaseIndex: p, coefficient: coef });
    }

    lines.push({
      sortOrder: sortOrder++,
      sectionTitle: currentSection,
      description: desc,
      unit: unit || undefined,
      quantity,
      unitPrice,
      lineTotal: lineTotal ?? 0,
      isSectionSubtotal: isSubtotal,
      isWorkDone,
      progressCoefficient,
      phases: phases.length ? phases : undefined,
    });
  }

  if (lines.length === 0 && sheetName) {
    /* fallback: try second row as headers */
    void sheetName;
  }
  return lines;
}

function parseProgressBillSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedProgressBill | null {
  const m = sheetName.match(/חשבון\s*(\d+)/i);
  if (!m) return null;
  const billNumber = Number(m[1]);
  if (!Number.isFinite(billNumber)) return null;

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  const lines: ParsedProgressBill["lines"] = [];
  let subtotal = 0;

  for (let r = 3; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const desc = normCell(row[1] ?? row[0]);
    if (!desc || /סה"כ|סיכום/i.test(desc)) continue;
    const lineTotal = numCell(row[5] ?? row[6]) ?? 0;
    if (lineTotal > 0) subtotal += lineTotal;
    lines.push({
      description: desc,
      contractQty: numCell(row[2]),
      unitPrice: numCell(row[3]),
      executedQty: numCell(row[4]),
      executedCoef: numCell(row[5]),
      lineTotal,
    });
  }

  return {
    billNumber,
    sheetName,
    lines,
    subtotal,
    total: subtotal,
  };
}

export function parseExcelProjectWorkbook(
  buffer: Buffer,
  sourceFileName: string,
): ParsedExcelProject {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const names = sheetNames(wb);
  const kind = detectKind(names);

  let boqLines: ParsedBoqLine[] = [];
  const progressBills: ParsedProgressBill[] = [];

  const mainSheet =
    names.find((n) => /הצעת\s*מחיר|כתב|חשבון(?!\s*\d)/i.test(n)) ?? names[0];
  if (mainSheet) {
    const sheet = wb.Sheets[mainSheet];
    if (sheet) boqLines = parseBoqSheet(sheet, mainSheet);
  }

  for (const name of names) {
    const bill = parseProgressBillSheet(wb.Sheets[name]!, name);
    if (bill) progressBills.push(bill);
  }

  const totalAmount = boqLines
    .filter((l) => !l.isSectionSubtotal)
    .reduce((s, l) => s + (l.lineTotal || 0), 0);

  return {
    kind,
    title: mainSheet ?? sourceFileName,
    sourceFileName,
    boqLines,
    progressBills,
    totalAmount,
  };
}
