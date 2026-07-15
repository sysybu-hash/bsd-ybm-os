import type ExcelJS from "exceljs";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";
import {
  C,
  applyHeader,
  autoWidth,
  bodyFont,
  fillSolid,
  inputFont,
  rtlAlignment,
  thinBorder,
  boldFont,
} from "@/lib/projects/blueprint-excel-core";

export function buildSummarySheet(
  ws: ExcelJS.Worksheet,
  analysis: BlueprintAnalysis,
  projectName: string,
  enginesUsed: string[],
  boqGrandTotalRow: number,
  boqGrandTotalValue: number,
): { contractValueRow: number } {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ rightToLeft: true }];

  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `כתב כמויות — ${projectName}`;
  titleCell.font = { bold: true, size: 18, name: "Arial", color: { argb: C.summaryFg } };
  titleCell.fill = fillSolid(C.summaryBg);
  titleCell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
  ws.getRow(1).height = 40;

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
    return r - 1;
  };

  writeStatRow("סעיפי כתב כמויות", analysis.boqLineItems.length);
  writeStatRow("משימות גנט", analysis.tasks.length);
  writeStatRow("אבני דרך", analysis.milestones.length);

  const contractValueRow = r;
  const contractValue = analysis.totalEstimatedCost ?? boqGrandTotalValue;
  writeStatRow("עלות כוללת משוערת ₪", contractValue, true);

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

export function buildTasksSheet(ws: ExcelJS.Worksheet, analysis: BlueprintAnalysis) {
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

export function buildMilestonesSheet(
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

    const pctCell = row.getCell(3);
    pctCell.value = pct;
    pctCell.numFmt = '0.0"%"';
    pctCell.font = inputFont(10);
    pctCell.fill = fillSolid(C.inputBg);

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
