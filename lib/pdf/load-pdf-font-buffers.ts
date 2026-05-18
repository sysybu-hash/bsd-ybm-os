import fs from "node:fs";
import path from "node:path";

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

export function loadPdfFontBuffers(): { regular: Buffer; bold: Buffer } {
  return {
    regular: readFontFile(REGULAR),
    bold: readFontFile(BOLD),
  };
}
