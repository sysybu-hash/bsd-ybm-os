import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

const FONT_DIR = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "noto-sans-hebrew",
  "files",
);

/** פונט עברי מקומי (ללא CDN) — יציב ב-Vercel וב-CI */
export function registerHebrewPdfFont(): void {
  if (registered) return;
  Font.register({
    family: "NotoSansHebrew",
    fonts: [
      {
        src: path.join(FONT_DIR, "noto-sans-hebrew-hebrew-400-normal.woff"),
        fontWeight: "normal",
      },
      {
        src: path.join(FONT_DIR, "noto-sans-hebrew-hebrew-700-normal.woff"),
        fontWeight: "bold",
      },
    ],
  });
  registered = true;
}
