import {
  NOTO_HEBREW_BOLD_BASE64,
  NOTO_HEBREW_REGULAR_BASE64,
} from "@/lib/pdf/font-data.generated";

export const PDF_FONT_VFS_KEYS = {
  regular: "pdf-fonts/NotoSansHebrew-Regular.ttf",
  bold: "pdf-fonts/NotoSansHebrew-Bold.ttf",
} as const;

/**
 * The Hebrew fonts every PDF here is set in, embedded in the bundle.
 *
 * This used to fall back to searching process.cwd() for the .ttf files. The
 * fallback never ran — scripts/prebuild.mjs regenerates the embedded data
 * before every build — but its presence was enough for Next to give up on
 * tracing and pull the whole project into each PDF function, which is what
 * pushed the floor-plan export past Vercel's 250MB limit.
 *
 * If this ever throws, the generated module is missing or empty: run
 * `node scripts/embed-pdf-fonts.mjs`, which prebuild does on every build.
 */
export function loadPdfFontBuffers(): { regular: Buffer; bold: Buffer } {
  if (!NOTO_HEBREW_REGULAR_BASE64 || !NOTO_HEBREW_BOLD_BASE64) {
    throw new Error(
      "PDF fonts are not embedded. Run `node scripts/embed-pdf-fonts.mjs` to regenerate lib/pdf/font-data.generated.ts.",
    );
  }
  return {
    regular: Buffer.from(NOTO_HEBREW_REGULAR_BASE64, "base64"),
    bold: Buffer.from(NOTO_HEBREW_BOLD_BASE64, "base64"),
  };
}
