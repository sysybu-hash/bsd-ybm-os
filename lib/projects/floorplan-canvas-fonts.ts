import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  NOTO_HEBREW_SCRIPT_BOLD_BASE64,
  NOTO_HEBREW_SCRIPT_REGULAR_BASE64,
} from "@/lib/pdf/font-data.generated";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";

/** The families every canvas drawing in the floor-plan pipeline asks for. */
export const CANVAS_FONT_BOLD = "BookletStampBold, BookletStampHeBold";
export const CANVAS_FONT_REGULAR = "BookletStamp, BookletStampHe";

/**
 * Hebrew-capable faces for @napi-rs/canvas.
 *
 * Arial covers Hebrew on a developer's Windows box; on Vercel's Linux nothing
 * does, and a caption drawn without these comes out as boxes. The Latin faces
 * carry the digits, the Hebrew ones the letters, and the font list in
 * CANVAS_FONT_* picks per glyph.
 */
export function registerCanvasFonts(GlobalFonts: {
  has: (name: string) => boolean;
  register: (font: Buffer, name?: string) => unknown;
  registerFromPath: (path: string, name?: string) => unknown;
}): void {
  const winBold = "C:\\Windows\\Fonts\\arialbd.ttf";
  const winReg = "C:\\Windows\\Fonts\\arial.ttf";
  if (existsSync(winBold) && !GlobalFonts.has("BookletStampBold")) {
    GlobalFonts.registerFromPath(winBold, "BookletStampBold");
  }
  if (existsSync(winReg) && !GlobalFonts.has("BookletStamp")) {
    GlobalFonts.registerFromPath(winReg, "BookletStamp");
  }
  // Hebrew glyphs first, the Latin faces behind them for digits. Arial covers
  // both on Windows; on Vercel's Linux nothing does unless we bring it.
  if (!GlobalFonts.has("BookletStampHe") && NOTO_HEBREW_SCRIPT_REGULAR_BASE64) {
    GlobalFonts.register(Buffer.from(NOTO_HEBREW_SCRIPT_REGULAR_BASE64, "base64"), "BookletStampHe");
  }
  if (!GlobalFonts.has("BookletStampHeBold") && NOTO_HEBREW_SCRIPT_BOLD_BASE64) {
    GlobalFonts.register(Buffer.from(NOTO_HEBREW_SCRIPT_BOLD_BASE64, "base64"), "BookletStampHeBold");
  }
  if (GlobalFonts.has("BookletStamp") && GlobalFonts.has("BookletStampBold")) return;
  const { regular, bold } = loadPdfFontBuffers();
  const dir = tmpdir();
  const boldPath = path.join(dir, "booklet-stamp-bold.ttf");
  const regPath = path.join(dir, "booklet-stamp.ttf");
  if (!existsSync(boldPath)) writeFileSync(boldPath, bold);
  if (!existsSync(regPath)) writeFileSync(regPath, regular);
  if (!GlobalFonts.has("BookletStampBold")) GlobalFonts.registerFromPath(boldPath, "BookletStampBold");
  if (!GlobalFonts.has("BookletStamp")) GlobalFonts.registerFromPath(regPath, "BookletStamp");
}
