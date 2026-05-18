import fs from "node:fs";
import path from "node:path";
import {
  NOTO_HEBREW_BOLD_BASE64,
  NOTO_HEBREW_REGULAR_BASE64,
} from "@/lib/pdf/font-data.generated";

const REGULAR = "NotoSansHebrew-Regular.ttf";
const BOLD = "NotoSansHebrew-Bold.ttf";

export const PDF_FONT_VFS_KEYS = {
  regular: "pdf-fonts/NotoSansHebrew-Regular.ttf",
  bold: "pdf-fonts/NotoSansHebrew-Bold.ttf",
} as const;

function fontSearchDirs(): string[] {
  const dirs = [
    path.join(process.cwd(), "lib", "pdf", "fonts"),
    path.join(process.cwd(), "public", "fonts"),
  ];
  if (typeof __dirname !== "undefined") {
    dirs.push(path.join(__dirname, "fonts"));
    dirs.push(path.join(__dirname, "..", "fonts"));
  }
  return dirs;
}

function readFontFile(fileName: string): Buffer {
  for (const dir of fontSearchDirs()) {
    const full = path.join(dir, fileName);
    if (fs.existsSync(full)) {
      return fs.readFileSync(full);
    }
  }
  throw new Error(
    `PDF fonts missing (${fileName}). Checked: ${fontSearchDirs().join(", ")}`,
  );
}

/** פונטים מוטמעים בבאנדל — עובד ב-Vercel ללא קבצי .ttf על הדיסק */
export function loadPdfFontBuffers(): { regular: Buffer; bold: Buffer } {
  if (NOTO_HEBREW_REGULAR_BASE64 && NOTO_HEBREW_BOLD_BASE64) {
    return {
      regular: Buffer.from(NOTO_HEBREW_REGULAR_BASE64, "base64"),
      bold: Buffer.from(NOTO_HEBREW_BOLD_BASE64, "base64"),
    };
  }
  return {
    regular: readFontFile(REGULAR),
    bold: readFontFile(BOLD),
  };
}
