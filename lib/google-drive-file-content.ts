import pdfParse from "pdf-parse";
import { inferMimeFromFileName } from "@/lib/scan-mime";

const MAX_NOTEBOOK_TEXT = 120_000;

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
