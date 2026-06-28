import ExcelJS from "exceljs";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
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

function headerFont(sz = 11): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: C.headerFg }, size: sz, name: "Arial" };
}
function bodyFont(sz = 10): Partial<ExcelJS.Font> {
  return { size: sz, name: "Arial" };
}
function boldFont(sz = 10): Partial<ExcelJS.Font> {
  return { bold: true, size: sz, name: "Arial" };
}
function inputFont(sz = 11): Partial<ExcelJS.Font> {
  // Blue = hardcoded input the user can change
  return { bold: true, size: sz, name: "Arial", color: { argb: "FF0000FF" } };
}

function fillSolid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
function thinBorder(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.BorderStyle = "thin";
  const c = { style: s, color: { argb: "FFCFD8DC" } };
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
      const v = cell.value;
      const len = typeof v === "object" && v !== null && "formula" in v
        ? 10
        : String(v ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 4, 60);
  });
}

// ─── Sheet 2: BOQ ─────────────────────────────────────────────────────────────
// Columns: A=#  B=description  C=category  D=drawingRef  E=unit  F=quantity  G=unitPrice  H=lineTotal  I=note  J=confidence
// Returns: { grandTotalRow, grandTotalValue }
function buildBoqSheet(
  ws: ExcelJS.Worksheet,
  analysis: BlueprintAnalysis,
): { grandTotalRow: number; grandTotalValue: number } {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit: 0 }];

  ws.columns = [
    { header: "#",            key: "num",         width: 5  },
    { header: "תיאור סעיף",  key: "description",  width: 45 },
    { header: "קטגוריה",     key: "category",     width: 20 },
    { header: "מ\"ת תוכנית", key: "drawingRef",   width: 14 },
    { header: "יחידה",       key: "unit",         width: 10 },
    { header: "כמות",        key: "quantity",     width: 10 },
    { header: "מחיר/יח'",    key: "unitPrice",    width: 12 },
    { header: "סה\"כ ₪",    key: "lineTotal",    width: 14 },
    { header: "הערות",       key: "note",         width: 25 },
    { header: "דיוק",        key: "confidence",   width: 10 },
  ];
  applyHeader(ws.getRow(1));

  const grouped = new Map<string, typeof analysis.boqLineItems>();
  for (const item of analysis.boqLineItems) {
    const cat = item.tradeCategory ?? "כללי";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  let rowIdx = 2;
  let globalNum = 1;
  let grandTotalValue = 0;
  const catTotalCells: string[] = []; // e.g. ["H5","H12"] for grand total formula

  for (const [category, items] of grouped) {
    // Category sub-header
    const catHeaderRow = ws.getRow(rowIdx++);
    ws.mergeCells(`B${catHeaderRow.number}:J${catHeaderRow.number}`);
    catHeaderRow.getCell(1).value = "";
    catHeaderRow.getCell(2).value = `▸  ${category}`;
    catHeaderRow.eachCell((c) => {
      c.fill = fillSolid(C.sectionBg);
      c.font = { bold: true, color: { argb: C.sectionFg }, size: 10, name: "Arial" };
      c.alignment = rtlAlignment();
      c.border = thinBorder();
    });
    catHeaderRow.height = 20;

    const firstDataRow = rowIdx;
    let catTotalValue = 0;

    for (const item of items) {
      const r = rowIdx++;
      const row = ws.getRow(r);
      const isEven = globalNum % 2 === 0;
      const bg = isEven ? C.rowEven : C.rowOdd;

      const hasQty   = item.quantity != null && typeof item.quantity === "number";
      const hasPrice = item.unitPrice != null && typeof item.unitPrice === "number";
      const lineTotal = item.lineTotal ?? (hasQty && hasPrice ? item.quantity! * item.unitPrice! : undefined);
      catTotalValue += lineTotal ?? 0;
      grandTotalValue += lineTotal ?? 0;

      const confBg =
        (item.confidence ?? 1) >= 0.8 ? C.confHigh
        : (item.confidence ?? 1) >= 0.5 ? C.confMed
        : C.confLow;

      row.getCell(1).value = globalNum++;
      row.getCell(2).value = item.description;
      row.getCell(3).value = item.tradeCategory ?? "כללי";
      row.getCell(4).value = item.drawingRef ?? "";
      row.getCell(5).value = item.unit ?? "";

      // Quantity & unitPrice — editable inputs (blue)
      const qtyCell = row.getCell(6);
      qtyCell.value = item.quantity ?? "";
      if (typeof item.quantity === "number") {
        qtyCell.numFmt = "#,##0.##";
        qtyCell.font = inputFont(10);
        qtyCell.fill = fillSolid(C.inputBg);
      }

      const priceCell = row.getCell(7);
      priceCell.value = item.unitPrice ?? "";
      if (typeof item.unitPrice === "number") {
        priceCell.numFmt = "#,##0 ₪";
        priceCell.font = inputFont(10);
        priceCell.fill = fillSolid(C.inputBg);
      }

      // lineTotal — formula F*G
      const totalCell = row.getCell(8);
      if (hasQty && hasPrice) {
        totalCell.value = { formula: `=F${r}*G${r}`, result: lineTotal };
        totalCell.numFmt = "#,##0 ₪";
      } else if (lineTotal != null) {
        totalCell.value = lineTotal;
        totalCell.numFmt = "#,##0 ₪";
      }

      row.getCell(9).value = item.note ?? "";
      row.getCell(10).value =
        (item.confidence ?? 1) >= 0.8 ? "גבוה ✓"
        : (item.confidence ?? 1) >= 0.5 ? "בינוני"
        : "בדוק";

      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === "FF000000") {
          cell.fill = fillSolid(col === 10 ? confBg : bg);
        }
        if (!cell.font || cell.font === bodyFont()) cell.font = bodyFont();
        cell.alignment = col === 2
          ? { ...rtlAlignment(true), horizontal: "right" }
          : rtlAlignment();
        cell.border = thinBorder();
      });
      row.height = 18;
    }

    const lastDataRow = rowIdx - 1;

    // Category total — formula SUM over data rows
    const catTotalRow = ws.getRow(rowIdx++);
    const catTotalRef = `H${catTotalRow.number}`;
    catTotalCells.push(catTotalRef);

    catTotalRow.getCell(2).value = `סה"כ ${category}`;
    const catTotCell = catTotalRow.getCell(8);
    catTotCell.value = {
      formula: `=SUM(H${firstDataRow}:H${lastDataRow})`,
      result: catTotalValue,
    };
    catTotCell.numFmt = "#,##0 ₪";
    catTotalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = fillSolid("FFF3E5F5");
      cell.font = boldFont(9);
      cell.alignment = rtlAlignment();
      cell.border = thinBorder();
    });
    catTotalRow.height = 18;
  }

  // Grand total — sum of category totals
  const grandTotalRow = rowIdx++;
  const gtr = ws.getRow(grandTotalRow);
  ws.mergeCells(`A${grandTotalRow}:G${grandTotalRow}`);
  gtr.getCell(1).value = "סה\"כ כתב כמויות";
  const gCell = gtr.getCell(8);
  gCell.value = {
    formula: catTotalCells.length > 0
      ? `=${catTotalCells.join("+")}`
      : "=0",
    result: grandTotalValue,
  };
  gCell.numFmt = "#,##0 ₪";
  gtr.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fillSolid(C.totalBg);
    cell.font = { bold: true, size: 12, name: "Arial", color: { argb: C.totalFg } };
    cell.alignment = rtlAlignment();
    cell.border = thinBorder();
  });
  gtr.height = 26;

  autoWidth(ws);
  ws.getColumn(2).width = 50;

  return { grandTotalRow, grandTotalValue };
}

// ─── Sheet 1: Summary ─────────────────────────────────────────────────────────
// contractValueRow: the row in this sheet where totalEstimatedCost lives (used by milestones)
// Returns { contractValueRow }
function buildSummarySheet(
  ws: ExcelJS.Worksheet,
  analysis: BlueprintAnalysis,
  projectName: string,
  enginesUsed: string[],
  boqGrandTotalRow: number,
  boqGrandTotalValue: number,
): { contractValueRow: number } {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true }];

  // Title
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `כתב כמויות — ${projectName}`;
  titleCell.font = { bold: true, size: 18, name: "Arial", color: { argb: C.summaryFg } };
  titleCell.fill = fillSolid(C.summaryBg);
  titleCell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
  ws.getRow(1).height = 40;

  // Subtitle
  ws.mergeCells("A2:D2");
  const sub = ws.getCell("A2");
  sub.value = `נוצר ב: ${new Date().toLocaleDateString("he-IL")}   |   מנועים: ${enginesUsed.join(" • ")}`;
  sub.font = { size: 10, name: "Arial", italic: true, color: { argb: "FF90A4AE" } };
  sub.fill = fillSolid(C.summaryBg);
  sub.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 20;

  ws.getColumn("A").width = 32;
  ws.getColumn("B").width = 26;

  let r = 4;

  const writeStatRow = (label: string, value: ExcelJS.CellValue, isInput = false) => {
    const row = ws.getRow(r);
    const lc = row.getCell(1);
    lc.value = label;
    lc.font = boldFont(11);
    lc.fill = fillSolid(r % 2 === 0 ? C.rowEven : C.rowOdd);
    lc.border = thinBorder();
    lc.alignment = rtlAlignment();

    const vc = row.getCell(2);
    vc.value = value;
    vc.font = isInput ? inputFont(11) : bodyFont(11);
    vc.fill = fillSolid(isInput ? C.inputBg : r % 2 === 0 ? C.rowEven : C.rowOdd);
    vc.border = thinBorder();
    vc.alignment = rtlAlignment();
    row.height = 22;
    r++;
    return r - 1; // return the row number just written
  };

  writeStatRow("סעיפי כתב כמויות", analysis.boqLineItems.length);
  writeStatRow("משימות גנט", analysis.tasks.length);
  writeStatRow("אבני דרך", analysis.milestones.length);

  // Contract value — EDITABLE INPUT (blue background + blue text)
  // This is the base for milestone amount formulas
  const contractValueRow = r;
  const contractValue = analysis.totalEstimatedCost ?? boqGrandTotalValue;
  writeStatRow("עלות כוללת משוערת ₪", contractValue, true /* isInput */);

  // BOQ computed sum — formula linking to BOQ sheet
  const boqSumRow = r;
  const boqSumRowObj = ws.getRow(boqSumRow);
  const lc = boqSumRowObj.getCell(1);
  lc.value = "סכום BOQ (מחושב)";
  lc.font = boldFont(11);
  lc.fill = fillSolid(r % 2 === 0 ? C.rowEven : C.rowOdd);
  lc.border = thinBorder();
  lc.alignment = rtlAlignment();

  const vc = boqSumRowObj.getCell(2);
  vc.value = {
    formula: `='כתב כמויות'!H${boqGrandTotalRow}`,
    result: boqGrandTotalValue,
  };
  vc.numFmt = "#,##0 ₪";
  vc.font = { bold: true, size: 11, name: "Arial", color: { argb: "FF1B5E20" } };
  vc.fill = fillSolid(r % 2 === 0 ? C.rowEven : C.rowOdd);
  vc.border = thinBorder();
  vc.alignment = rtlAlignment();
  boqSumRowObj.height = 22;
  r++;

  // Legend: blue = editable input
  r++;
  ws.mergeCells(`A${r}:D${r}`);
  const legendCell = ws.getCell(`A${r}`);
  legendCell.value = "💡 תאים בכחול הם ערכי קלט — שנה אותם וכל הטבלאות יתעדכנו אוטומטית";
  legendCell.font = { size: 9, name: "Arial", italic: true, color: { argb: "FF546E7A" } };
  legendCell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
  ws.getRow(r).height = 18;
  r++;

  if (analysis.projectSummary) {
    r++;
    ws.mergeCells(`A${r}:D${r}`);
    const sr = ws.getRow(r);
    sr.getCell(1).value = analysis.projectSummary;
    sr.getCell(1).font = bodyFont(10);
    sr.getCell(1).alignment = { ...rtlAlignment(true), horizontal: "right" };
    sr.height = 60;
  }

  return { contractValueRow };
}

// ─── Sheet 3: Tasks ───────────────────────────────────────────────────────────
function buildTasksSheet(ws: ExcelJS.Worksheet, analysis: BlueprintAnalysis) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit: 0 }];

  ws.columns = [
    { header: "#",           key: "num",         width: 5  },
    { header: "שם משימה",   key: "name",         width: 35 },
    { header: "קטגוריה",    key: "category",     width: 20 },
    { header: "תלוי ב",     key: "dependsOn",    width: 25 },
    { header: "משך (ימים)", key: "durationDays", width: 12 },
    { header: "תחילה",      key: "startDate",    width: 14 },
    { header: "סיום",       key: "endDate",      width: 14 },
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
// Columns: A=# B=name C=percent% D=amount E=description F=bar
// Amount formula: =C{r}/100 * 'סיכום'!B{contractValueRow}
function buildMilestonesSheet(
  ws: ExcelJS.Worksheet,
  analysis: BlueprintAnalysis,
  contractValueRow: number,
) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit: 0 }];

  ws.columns = [
    { header: "#",          key: "num",         width: 5  },
    { header: "שלב תשלום", key: "name",         width: 35 },
    { header: "% מחוזה",   key: "percent",      width: 12 },
    { header: "סכום ₪",    key: "amount",       width: 16 },
    { header: "תיאור",     key: "description",  width: 40 },
    { header: "מצב",       key: "bar",          width: 20 },
  ];
  applyHeader(ws.getRow(1), C.headerBg);

  const firstDataRow = 2;
  const lastDataRow = analysis.milestones.length + 1;
  let totalPct = 0;
  let totalAmt = 0;

  analysis.milestones.forEach((m, i) => {
    const r = i + 2;
    const row = ws.getRow(r);
    const pct = m.percent != null ? Number(m.percent) : 0;
    const amt = m.amount != null ? Number(m.amount) : (pct / 100) * (analysis.totalEstimatedCost ?? 0);
    totalPct += pct;
    totalAmt += amt;

    const barLen = Math.round(pct / 5);
    const bar = "█".repeat(Math.max(0, barLen)) + "░".repeat(Math.max(0, 20 - barLen));

    row.getCell(1).value = i + 1;
    row.getCell(2).value = m.name;

    // Percent — editable input (blue)
    const pctCell = row.getCell(3);
    pctCell.value = pct;
    pctCell.numFmt = '0.0"%"';
    pctCell.font = inputFont(10);
    pctCell.fill = fillSolid(C.inputBg);

    // Amount — formula: percent/100 × contract value from summary sheet
    const amtCell = row.getCell(4);
    amtCell.value = {
      formula: `=C${r}/100*'סיכום'!B${contractValueRow}`,
      result: amt,
    };
    amtCell.numFmt = "#,##0 ₪";

    row.getCell(5).value = m.description ?? "";
    row.getCell(6).value = bar;

    const bg = i % 2 === 0 ? C.rowEven : C.rowOdd;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === "FF000000") {
        cell.fill = fillSolid(bg);
      }
      if (col === 6) {
        cell.font = { name: "Courier New", size: 9, color: { argb: "FF1565C0" } };
      } else if (!cell.font || cell.font === bodyFont()) {
        cell.font = bodyFont();
      }
      cell.alignment = rtlAlignment();
      cell.border = thinBorder();
    });
    row.height = 22;
  });

  // Total row — SUM formulas
  const tr = ws.getRow(lastDataRow + 1);
  tr.getCell(1).value = "";
  tr.getCell(2).value = "סה\"כ";

  const pctTotalCell = tr.getCell(3);
  pctTotalCell.value = {
    formula: `=SUM(C${firstDataRow}:C${lastDataRow})`,
    result: totalPct,
  };
  pctTotalCell.numFmt = '0.0"%"';

  const amtTotalCell = tr.getCell(4);
  amtTotalCell.value = {
    formula: `=SUM(D${firstDataRow}:D${lastDataRow})`,
    result: totalAmt,
  };
  amtTotalCell.numFmt = "#,##0 ₪";

  tr.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fillSolid(C.totalBg);
    cell.font = boldFont(11);
    cell.alignment = rtlAlignment();
    cell.border = thinBorder();
  });
  tr.height = 24;

  // Legend
  const legendRow = ws.getRow(lastDataRow + 3);
  ws.mergeCells(`A${lastDataRow + 3}:F${lastDataRow + 3}`);
  legendRow.getCell(1).value =
    "💡 שנה % בעמודה ג׳ (כחול) — הסכום ועמודת הסיכום יתעדכנו אוטומטית לפי עלות הפרויקט";
  legendRow.getCell(1).font = { size: 9, name: "Arial", italic: true, color: { argb: "FF546E7A" } };
  legendRow.getCell(1).alignment = { horizontal: "right", readingOrder: "rtl" };
  legendRow.height = 18;

  autoWidth(ws);
  ws.getColumn(2).width = 38;
  ws.getColumn(5).width = 42;
}

// ─── Main export ──────────────────────────────────────────────────────────────
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

  const wsSummary    = wb.addWorksheet("סיכום",       { properties: { tabColor: { argb: C.tabSummary    } } });
  const wsBoq        = wb.addWorksheet("כתב כמויות",  { properties: { tabColor: { argb: C.tabBoq        } } });
  const wsTasks      = wb.addWorksheet("לוח זמנים",   { properties: { tabColor: { argb: C.tabTasks      } } });
  const wsMilestones = wb.addWorksheet("אבני דרך",    { properties: { tabColor: { argb: C.tabMilestones } } });

  // Build BOQ first — we need its grand total row reference for summary + milestones
  const { grandTotalRow, grandTotalValue } = buildBoqSheet(wsBoq, analysis);

  // Build summary — we need its contract value row for milestones
  const { contractValueRow } = buildSummarySheet(
    wsSummary, analysis, projectName, enginesUsed, grandTotalRow, grandTotalValue,
  );

  buildTasksSheet(wsTasks, analysis);
  buildMilestonesSheet(wsMilestones, analysis, contractValueRow);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
