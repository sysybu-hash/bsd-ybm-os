import pdfParse from "pdf-parse";
import type { CellValue } from "exceljs";
import { inferMimeFromFileName } from "@/lib/scan-mime";

const MAX_NOTEBOOK_TEXT = 120_000;

/** ממיר ערך תא של exceljs למחרוזת CSV בטוחה (עוטף בגרשיים אם יש פסיק/ציטוט/שורה). */
function toCsvCell(value: CellValue): string {
  let s: string;
  if (value == null) s = "";
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") {
    const o = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (o.richText) s = o.richText.map((r) => r.text).join("");
    else if (o.text != null) s = String(o.text);
    else if (o.result != null) s = String(o.result);
    else s = "";
  } else s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function extractTextForNotebook(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const mime = inferMimeFromFileName(fileName, mimeType);

  if (mime === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    const parsed = await pdfParse(buffer);
    return (parsed.text ?? "").trim().slice(0, MAX_NOTEBOOK_TEXT);
  }

  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    return buffer.toString("utf8").trim().slice(0, MAX_NOTEBOOK_TEXT);
  }

  if (mime.startsWith("image/")) {
    return `[קובץ תמונה: ${fileName} — הועלה למחברת כמקור; לפענוח מלא השתמשו בפענוח AI]`;
  }

  if (
    mime.includes("spreadsheet") ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileName.toLowerCase().endsWith(".xlsx") ||
    fileName.toLowerCase().endsWith(".xls")
  ) {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
      const parts: string[] = [];
      for (const ws of wb.worksheets.slice(0, 8)) {
        const colCount = Math.max(1, ws.columnCount);
        const lines: string[] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const cells: string[] = [];
          for (let c = 1; c <= colCount; c++) cells.push(toCsvCell(row.getCell(c).value));
          lines.push(cells.join(","));
        });
        parts.push(`## ${ws.name}\n${lines.join("\n")}`);
      }
      return parts.join("\n\n").trim().slice(0, MAX_NOTEBOOK_TEXT);
    } catch {
      return `[גיליון Excel: ${fileName} — לא ניתן לחלץ טקסט]`;
    }
  }

  if (
    mime.includes("wordprocessingml") ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return (result.value ?? "").trim().slice(0, MAX_NOTEBOOK_TEXT);
    } catch {
      return `[מסמך Word: ${fileName}]`;
    }
  }

  return `[קובץ: ${fileName}, סוג: ${mime} — תוכן בינארי; לחילוץ טקסט מלא השתמשו בפענוח AI]`;
}

export function buildFolderListingMarkdown(
  folderName: string,
  files: Array<{ name: string; mimeType: string; webViewLink?: string | null }>,
): string {
  const lines = [`# תיקייה: ${folderName}`, "", "| שם | סוג | קישור |", "| --- | --- | --- |"];
  for (const f of files) {
    const kind = f.mimeType.includes("folder") ? "תיקייה" : f.mimeType.split("/").pop() ?? f.mimeType;
    const link = f.webViewLink ? `[פתח](${f.webViewLink})` : "—";
    lines.push(`| ${f.name} | ${kind} | ${link} |`);
  }
  return lines.join("\n").slice(0, MAX_NOTEBOOK_TEXT);
}
