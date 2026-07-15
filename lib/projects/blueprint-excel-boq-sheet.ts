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

// Columns: A=#  B=description  C=category  D=drawingRef  E=unit  F=quantity  G=unitPrice  H=lineTotal  I=note  J=confidence
export function buildBoqSheet(
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
  const catTotalCells: string[] = [];

  for (const [category, items] of grouped) {
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
