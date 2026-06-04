import fs from "node:fs";
import path from "node:path";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";

export const BROCHURE_SHOT_DIR = path.join(process.cwd(), "assets", "product-brochure-v2");

export function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face { font-family: "NotoHebrew"; font-style: normal; font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-style: normal; font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype"); }`;
}

export function imgDataUrl(fileName: string): string | null {
  const full = path.join(BROCHURE_SHOT_DIR, fileName);
  if (!fs.existsSync(full)) return null;
  return `data:image/png;base64,${fs.readFileSync(full).toString("base64")}`;
}

export function loadLogo(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "logos", "logo-night.png"),
    path.join(process.cwd(), "assets", "logo-bsd-ybm-center.png"),
    path.join(process.cwd(), "assets", "logo-bsd-ybm-official.png"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return `data:image/png;base64,${fs.readFileSync(candidate).toString("base64")}`;
    }
  }
  return null;
}
