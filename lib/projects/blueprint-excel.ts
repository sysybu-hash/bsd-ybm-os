import ExcelJS from "exceljs";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  // Header rows
  headerBg:      "FF1B4F72",
  headerFg:      "FFFFFFFF",
  // Section sub-headers (per tradeCategory)
  sectionBg:     "FF2D7D9A",
  sectionFg:     "FFFFFFFF",
  // Alternating rows
  rowEven:       "FFF0F7FF",
  rowOdd:        "FFFFFFFF",
  // Total row
  totalBg:       "FFE8F5E9",
  totalFg:       "FF1B5E20",
  // Confidence colors
  confHigh:      "FFE8F5E9",
  confMed:       "FFFFF9C4",
  confLow:       "FFFFEBEE",
  // Summary header
  summaryBg:     "FF0D2137",
  summaryFg:     "FFFFFFFF",
  // Milestone track
  mileActive:    "FF4CAF50",
  mileBar:       "FFB2EBF2",
  // Tab colors (sheet tabs)
  tabBoq:        "FF1B4F72",
  tabTasks:      "FF4A148C",
  tabMilestones: "FF1B5E20",
  tabSummary:    "FF37474F",
} as const;

function headerFont(sz = 11): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: C.headerFg }, size: sz, name: "Arial" };
}
function bodyFont(sz = 10): Partial<ExcelJS.Font> {
  return { size: sz, name: "Arial" };
}
function boldFont(sz = 10): Partial<ExcelJS.Font> {
  return { bold: true, size: sz, name: "Arial" };
}

function fillSolid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.BorderStyle = "thin";
  const c = { style: side, color: { argb: "FFCFD8DC" } };
  return { top: c, bottom: c, left: c, right: c };
}

function rtlAlignment(wrapText = false): Partial<ExcelJS.Alignment> {
  return { readingOrder: "rtl", horizontal: "right", vertical: "middle", wrapText };
}

function applyHeader(row: ExcelJS.Row, bgArgb = C.headerBg) {
  row.eachCell((cell) => {
    cell.fill = fillSolid(bgArgb);
    cell.font = headerFont();
    cell.alignment = rtlAlignment();
    cell.border = thinBorder();
  });
  row.height = 22;
}

function autoWidth(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 4, 60);
  });
}

// ─── Sheet 1: Summary ─────────────────────────────────────────────────────────
function buildSummarySheet(
  ws: ExcelJS.Worksheet,
  analysis: BlueprintAnalysis,
  projectName: string,
  enginesUsed: string[],
) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true }];

  // Big title
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `כתב כמויות — ${projectName}`;
  titleCell.font = { bold: true, size: 18, name: "Arial", color: { argb: C.summaryFg } };
  titleCell.fill = fillSolid(C.summaryBg);
  titleCell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
  ws.getRow(1).height = 40;

  // Subtitle row
  ws.mergeCells("A2:D2");
  const sub = ws.getCell("A2");
  sub.value = `נוצר ב: ${new Date().toLocaleDateString("he-IL")}   |   מנועים: ${enginesUsed.join(" • ")}`;
  sub.font = { size: 10, name: "Arial", italic: true, color: { argb: "FF90A4AE" } };
  sub.fill = fillSolid(C.summaryBg);
  sub.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 20;

  // Stats
  const stats = [
    ["סעיפי כתב כמויות", analysis.boqLineItems.length],
    ["משימות גנט", analysis.tasks.length],
    ["אבני דרך", analysis.milestones.length],
    ["עלות כוללת משוערת", analysis.totalEstimatedCost
      ? `₪${analysis.totalEstimatedCost.toLocaleString("he-IL")}`
      : "לא חושבה"],
    ["סכום BOQ (מחושב)", (() => {
      const total = analysis.boqLineItems.reduce((s, b) => s + (b.lineTotal ?? 0), 0);
      return total > 0 ? `₪${total.toLocaleString("he-IL")}` : "—";
    })()],
  ];

  let r = 4;
  const labelCol = ws.getColumn("A");
  labelCol.width = 30;
  ws.getColumn("B").width = 25;

  for (const [label, value] of stats) {
    const row = ws.getRow(r++);
    const lc = row.getCell(1);
    lc.value = label as string;
    lc.font = boldFont(11);
    lc.fill = fillSolid(r % 2 === 0 ? C.rowEven : C.rowOdd);
    lc.border = thinBorder();
    lc.alignment = rtlAlignment();

    const vc = row.getCell(2);
    vc.value = value as string | number;
    vc.font = bodyFont(11);
    vc.fill = fillSolid(r % 2 === 0 ? C.rowEven : C.rowOdd);
    vc.border = thinBorder();
    vc.alignment = rtlAlignment();
    row.height = 22;
  }

  if (analysis.projectSummary) {
    const sr = ws.getRow(r + 1);
    ws.mergeCells(`A${r + 1}:D${r + 1}`);
    sr.getCell(1).value = analysis.projectSummary;
    sr.getCell(1).font = bodyFont(10);
    sr.getCell(1).alignment = { ...rtlAlignment(true), horizontal: "right" };
    sr.height = 50;
  }
}

// ─── Sheet 2: BOQ ─────────────────────────────────────────────────────────────
function buildBoqSheet(ws: ExcelJS.Worksheet, analysis: BlueprintAnalysis) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit: 0 }];

  const cols = [
    { header: "#",           key: "num",         width: 5  },
    { header: "תיאור סעיף", key: "description",  width: 45 },
    { header: "קטגוריה",    key: "category",     width: 20 },
    { header: "מ\"ת תוכנית",key: "drawingRef",   width: 14 },
    { header: "יחידה",      key: "unit",         width: 10 },
    { header: "כמות",       key: "quantity",     width: 10 },
    { header: "מחיר/יח'",   key: "unitPrice",    width: 12 },
    { header: "סה\"כ ₪",   key: "lineTotal",    width: 14 },
    { header: "הערות",      key: "note",         width: 25 },
    { header: "דיוק",       key: "confidence",   width: 10 },
  ];
  ws.columns = cols;
  applyHeader(ws.getRow(1));

  // Group by tradeCategory
  const grouped = new Map<string, typeof analysis.boqLineItems>();
  for (const item of analysis.boqLineItems) {
    const cat = item.tradeCategory ?? "כללי";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  let rowIdx = 2;
  let globalNum = 1;
  let grandTotal = 0;

  for (const [category, items] of grouped) {
    // Category sub-header
    const catRow = ws.getRow(rowIdx++);
    ws.mergeCells(`B${catRow.number}:J${catRow.number}`);
    catRow.getCell(1).value = "";
    catRow.getCell(2).value = `▸  ${category}`;
    catRow.eachCell((c) => {
      c.fill = fillSolid(C.sectionBg);
      c.font = { bold: true, color: { argb: C.sectionFg }, size: 10, name: "Arial" };
      c.alignment = rtlAlignment();
      c.border = thinBorder();
    });
    catRow.height = 20;

    let catTotal = 0;

    for (const item of items) {
      const row = ws.getRow(rowIdx++);
      const isEven = globalNum % 2 === 0;
      const bg = isEven ? C.rowEven : C.rowOdd;
      const lineTotal = item.lineTotal ?? (
        item.quantity != null && item.unitPrice != null
          ? item.quantity * item.unitPrice
          : undefined
      );
      catTotal += lineTotal ?? 0;
      grandTotal += lineTotal ?? 0;

      const confBg =
        (item.confidence ?? 1) >= 0.8 ? C.confHigh
        : (item.confidence ?? 1) >= 0.5 ? C.confMed
        : C.confLow;

      const values: Record<string, unknown> = {
        num: globalNum++,
        description: item.description,
        category: item.tradeCategory ?? "כללי",
        drawingRef: item.drawingRef ?? "",
        unit: item.unit ?? "",
        quantity: item.quantity ?? "",
        unitPrice: item.unitPrice ?? "",
        lineTotal: lineTotal ?? "",
        note: item.note ?? "",
        confidence:
          (item.confidence ?? 1) >= 0.8 ? "גבוה ✓"
          : (item.confidence ?? 1) >= 0.5 ? "בינוני"
          : "בדוק",
      };

      row.values = [
        values.num as number,
        values.description as string,
        values.category as string,
        values.drawingRef as string,
        values.unit as string,
        values.quantity as number | string,
        values.unitPrice as number | string,
        values.lineTotal as number | string,
        values.note as string,
        values.confidence as string,
      ];

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.fill = fillSolid(colNumber === 10 ? confBg : bg);
        cell.font = bodyFont();
        cell.alignment = colNumber === 2
          ? { ...rtlAlignment(true), horizontal: "right" }
          : rtlAlignment();
        cell.border = thinBorder();
        if ([6, 7, 8].includes(colNumber) && typeof cell.value === "number") {
          cell.numFmt = "#,##0.00";
        }
      });
      row.height = 18;
    }

    // Category total
    const catTotalRow = ws.getRow(rowIdx++);
    catTotalRow.getCell(2).value = `סה"כ ${category}`;
    catTotalRow.getCell(8).value = catTotal > 0 ? catTotal : "";
    catTotalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = fillSolid("FFF3E5F5");
      cell.font = boldFont(9);
      cell.alignment = rtlAlignment();
      cell.border = thinBorder();
    });
    if (catTotal > 0) {
      const tc = catTotalRow.getCell(8);
      tc.numFmt = "#,##0.00 ₪";
    }
    catTotalRow.height = 18;
  }

  // Grand total
  const totalRow = ws.getRow(rowIdx++);
  ws.mergeCells(`A${totalRow.number}:G${totalRow.number}`);
  totalRow.getCell(1).value = "סה\"כ כתב כמויות";
  totalRow.getCell(8).value = grandTotal > 0 ? grandTotal : "";
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fillSolid(C.totalBg);
    cell.font = { bold: true, size: 12, name: "Arial", color: { argb: C.totalFg } };
    cell.alignment = rtlAlignment();
    cell.border = thinBorder();
  });
  if (grandTotal > 0) {
    totalRow.getCell(8).numFmt = "#,##0.00 ₪";
  }
  totalRow.height = 26;

  autoWidth(ws);
  ws.getColumn(2).width = 50;
}

// ─── Sheet 3: Tasks ───────────────────────────────────────────────────────────
function buildTasksSheet(ws: ExcelJS.Worksheet, analysis: BlueprintAnalysis) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit: 0 }];

  ws.columns = [
    { header: "#",          key: "num",          width: 5  },
    { header: "שם משימה",  key: "name",          width: 35 },
    { header: "קטגוריה",   key: "category",      width: 20 },
    { header: "תלוי ב",    key: "dependsOn",     width: 25 },
    { header: "משך (ימים)",key: "durationDays",  width: 12 },
    { header: "תחילה",     key: "startDate",     width: 14 },
    { header: "סיום",      key: "endDate",       width: 14 },
  ];
  applyHeader(ws.getRow(1));

  analysis.tasks.forEach((task, i) => {
    const row = ws.getRow(i + 2);
    row.values = [
      i + 1,
      task.name,
      task.tradeCategory ?? "",
      Array.isArray(task.dependsOn) ? task.dependsOn.join(", ") : "",
      task.durationDays ?? "",
      task.startDate ?? "",
      task.endDate ?? "",
    ];
    const bg = i % 2 === 0 ? C.rowEven : C.rowOdd;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = fillSolid(bg);
      cell.font = bodyFont();
      cell.alignment = rtlAlignment(true);
      cell.border = thinBorder();
    });
    row.height = 20;
  });

  autoWidth(ws);
  ws.getColumn(2).width = 38;
}

// ─── Sheet 4: Milestones ──────────────────────────────────────────────────────
function buildMilestonesSheet(ws: ExcelJS.Worksheet, analysis: BlueprintAnalysis) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit: 0 }];

  ws.columns = [
    { header: "#",           key: "num",         width: 5  },
    { header: "שלב תשלום",  key: "name",         width: 35 },
    { header: "% מחוזה",    key: "percent",      width: 12 },
    { header: "סכום ₪",     key: "amount",       width: 16 },
    { header: "תיאור",      key: "description",  width: 40 },
    { header: "מצב",        key: "bar",          width: 20 },
  ];
  applyHeader(ws.getRow(1), C.headerBg);

  analysis.milestones.forEach((m, i) => {
    const row = ws.getRow(i + 2);
    const pct = m.percent != null ? Number(m.percent) : null;
    const barLen = pct != null ? Math.round(pct / 5) : 0; // 0–20 chars
    const bar = "█".repeat(Math.max(0, barLen)) + "░".repeat(Math.max(0, 20 - barLen));

    row.values = [
      i + 1,
      m.name,
      pct != null ? `${pct}%` : "",
      m.amount != null ? Number(m.amount) : "",
      m.description ?? "",
      bar,
    ];

    const bg = i % 2 === 0 ? C.rowEven : C.rowOdd;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = fillSolid(bg);
      cell.font = col === 6
        ? { name: "Courier New", size: 9, color: { argb: "FF1565C0" } }
        : bodyFont();
      cell.alignment = rtlAlignment();
      cell.border = thinBorder();
      if (col === 4 && typeof cell.value === "number") cell.numFmt = "#,##0 ₪";
    });
    row.height = 22;
  });

  // Total %
  const totalPct = analysis.milestones.reduce((s, m) => s + (m.percent != null ? Number(m.percent) : 0), 0);
  const totalAmt = analysis.milestones.reduce((s, m) => s + (m.amount != null ? Number(m.amount) : 0), 0);
  const tr = ws.getRow(analysis.milestones.length + 2);
  tr.values = ["", "סה\"כ", `${totalPct}%`, totalAmt > 0 ? totalAmt : "", "", ""];
  tr.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fillSolid(C.totalBg);
    cell.font = boldFont(11);
    cell.alignment = rtlAlignment();
    cell.border = thinBorder();
  });
  if (totalAmt > 0) tr.getCell(4).numFmt = "#,##0 ₪";
  tr.height = 24;

  autoWidth(ws);
  ws.getColumn(2).width = 38;
  ws.getColumn(5).width = 42;
}

// ─── Main export function ─────────────────────────────────────────────────────
export async function buildBlueprintExcel(
  analysis: BlueprintAnalysis,
  projectName: string,
  enginesUsed: string[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BSD YBM OS";
  wb.created = new Date();
  wb.title = `כתב כמויות — ${projectName}`;
  wb.subject = "Blueprint BOQ Analysis";
  wb.keywords = "גרמושקה, BOQ, כתב כמויות";

  const wsSummary    = wb.addWorksheet("סיכום",        { properties: { tabColor: { argb: C.tabSummary    } } });
  const wsBoq        = wb.addWorksheet("כתב כמויות",   { properties: { tabColor: { argb: C.tabBoq        } } });
  const wsTasks      = wb.addWorksheet("לוח זמנים",    { properties: { tabColor: { argb: C.tabTasks      } } });
  const wsMilestones = wb.addWorksheet("אבני דרך",     { properties: { tabColor: { argb: C.tabMilestones } } });

  buildSummarySheet(wsSummary, analysis, projectName, enginesUsed);
  buildBoqSheet(wsBoq, analysis);
  buildTasksSheet(wsTasks, analysis);
  buildMilestonesSheet(wsMilestones, analysis);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
