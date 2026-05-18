import fs from "node:fs";
import path from "node:path";

/** מיקום פונטים — lib/pdf/fonts נכלל ב-tracing של Vercel; public/ כגיבוי מקומי */
export function resolvePdfFontDir(): string {
  const candidates = [
    path.join(process.cwd(), "lib", "pdf", "fonts"),
    path.join(process.cwd(), "public", "fonts"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "NotoSansHebrew-Regular.ttf"))) {
      return dir;
    }
  }
  throw new Error(
    `PDF fonts missing. Checked: ${candidates.join(", ")}`,
  );
}
