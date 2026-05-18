import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";
import { resolvePdfFontDir } from "@/lib/pdf/resolve-pdf-font-dir";

let registered = false;

/** טוען פונט כ-base64 — עובד ב-Vercel גם כשנתיב קובץ לא נגיש ל-react-pdf */
function fontDataUri(filename: string): string {
  const filePath = path.join(resolvePdfFontDir(), filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`קובץ פונט PDF חסר: ${filePath}`);
  }
  const data = fs.readFileSync(filePath);
  return `data:font/ttf;base64,${data.toString("base64")}`;
}

export function registerHebrewPdfFont(): void {
  if (registered) return;
  Font.register({
    family: "NotoSansHebrew",
    fonts: [
      {
        src: fontDataUri("NotoSansHebrew-Regular.ttf"),
        fontWeight: "normal",
      },
      {
        src: fontDataUri("NotoSansHebrew-Bold.ttf"),
        fontWeight: "bold",
      },
    ],
  });
  registered = true;
}
