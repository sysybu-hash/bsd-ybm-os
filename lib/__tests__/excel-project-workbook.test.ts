import * as XLSX from "xlsx";
import { parseExcelProjectWorkbook } from "@/lib/imports/excel-project-workbook";

describe("excel-project-workbook", () => {
  it("parses BOQ rows from minimal sheet", () => {
    const wb = XLSX.utils.book_new();
    const data = [
      ["תיאור", "יחידה", "כמות", "מחיר יחידה", 'סה"כ'],
      ["יציקת יסוד", "מ³", 12, 450, 5400],
      ["ברזל 12", "טון", 2, 4200, 8400],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "כתב כמויות");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const parsed = parseExcelProjectWorkbook(buf, "quote-minimal.xlsx");
    expect(parsed.boqLines.length).toBeGreaterThanOrEqual(2);
    expect(parsed.boqLines[0]?.description).toMatch(/יציק/);
    expect(parsed.totalAmount).toBeGreaterThan(0);
  });
});
