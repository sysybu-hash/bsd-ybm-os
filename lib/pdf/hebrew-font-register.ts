import path from "node:path";
import { Font } from "@react-pdf/renderer";
import { resolvePdfFontDir } from "@/lib/pdf/resolve-pdf-font-dir";

let registered = false;

function fontPath(filename: string): string {
  return path.join(resolvePdfFontDir(), filename);
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
