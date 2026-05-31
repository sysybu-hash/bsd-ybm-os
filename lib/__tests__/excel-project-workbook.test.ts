import ExcelJS from "exceljs";
import { parseExcelProjectWorkbook } from "@/lib/imports/excel-project-workbook";

describe("excel-project-workbook", () => {
  it("parses BOQ rows from minimal sheet", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("כתב כמויות");
    ws.addRows([
      ["תיאור", "יחידה", "כמות", "מחיר יחידה", 'סה"כ'],
      ["יציקת יסוד", "מ³", 12, 450, 5400],
      ["ברזל 12", "טון", 2, 4200, 8400],
    ]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const parsed = await parseExcelProjectWorkbook(buf, "quote-minimal.xlsx");
    expect(parsed.boqLines.length).toBeGreaterThanOrEqual(2);
    expect(parsed.boqLines[0]?.description).toMatch(/יציק/);
    expect(parsed.totalAmount).toBeGreaterThan(0);
  });
});
