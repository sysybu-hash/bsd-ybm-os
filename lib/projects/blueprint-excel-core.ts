import ExcelJS from "exceljs";

// ─── Color palette ────────────────────────────────────────────────────────────
export const BLUEPRINT_EXCEL_COLORS = {
  headerBg:      "FF1B4F72",
  headerFg:      "FFFFFFFF",
  sectionBg:     "FF2D7D9A",
  sectionFg:     "FFFFFFFF",
  rowEven:       "FFF0F7FF",
  rowOdd:        "FFFFFFFF",
  totalBg:       "FFE8F5E9",
  totalFg:       "FF1B5E20",
  inputBg:       "FFFFF9C4",  // yellow = editable input
  confHigh:      "FFE8F5E9",
  confMed:       "FFFFF9C4",
  confLow:       "FFFFEBEE",
  summaryBg:     "FF0D2137",
  summaryFg:     "FFFFFFFF",
  mileBar:       "FFB2EBF2",
  tabBoq:        "FF1B4F72",
  tabTasks:      "FF4A148C",
  tabMilestones: "FF1B5E20",
  tabSummary:    "FF37474F",
} as const;

export type BlueprintExcelColors = typeof BLUEPRINT_EXCEL_COLORS;
export const C = BLUEPRINT_EXCEL_COLORS;

export function headerFont(sz = 11): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: C.headerFg }, size: sz, name: "Arial" };
}
export function bodyFont(sz = 10): Partial<ExcelJS.Font> {
  return { size: sz, name: "Arial" };
}
export function boldFont(sz = 10): Partial<ExcelJS.Font> {
  return { bold: true, size: sz, name: "Arial" };
}
export function inputFont(sz = 11): Partial<ExcelJS.Font> {
  return { bold: true, size: sz, name: "Arial", color: { argb: "FF0000FF" } };
}

export function fillSolid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
export function thinBorder(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.BorderStyle = "thin";
  const c = { style: s, color: { argb: "FFCFD8DC" } };
  return { top: c, bottom: c, left: c, right: c };
}
export function rtlAlignment(wrapText = false): Partial<ExcelJS.Alignment> {
  return { readingOrder: "rtl", horizontal: "right", vertical: "middle", wrapText };
}
export function applyHeader(row: ExcelJS.Row, bgArgb = C.headerBg) {
  row.eachCell((cell) => {
    cell.fill = fillSolid(bgArgb);
    cell.font = headerFont();
    cell.alignment = rtlAlignment();
    cell.border = thinBorder();
  });
  row.height = 22;
}
export function autoWidth(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const len = typeof v === "object" && v !== null && "formula" in v
        ? 10
        : String(v ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 4, 60);
  });
}
