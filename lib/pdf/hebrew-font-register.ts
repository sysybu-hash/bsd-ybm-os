import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

function fontPath(filename: string): string {
  const filePath = path.join(FONT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`קובץ פונט PDF חסר: ${filePath}`);
  }
  return filePath;
}

/** פונט עברי מ־public/fonts (TTF) — נכלל בדיפלוי, ללא CDN */
export function registerHebrewPdfFont(): void {
  if (registered) return;
  Font.register({
    family: "NotoSansHebrew",
    fonts: [
      {
        src: fontPath("NotoSansHebrew-Regular.ttf"),
        fontWeight: "normal",
      },
      {
        src: fontPath("NotoSansHebrew-Bold.ttf"),
        fontWeight: "bold",
      },
    ],
  });
  registered = true;
}
