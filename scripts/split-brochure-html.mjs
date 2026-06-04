import fs from "node:fs";

const p = "lib/pdf/product-brochure-v2-html.ts";
const s = fs.readFileSync(p, "utf8");

const assets = `import fs from "node:fs";
import path from "node:path";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";

export const BROCHURE_SHOT_DIR = path.join(process.cwd(), "assets", "product-brochure-v2");

export function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return \`
@font-face { font-family: "NotoHebrew"; font-style: normal; font-weight: 400;
  src: url(data:font/ttf;base64,\${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-style: normal; font-weight: 700;
  src: url(data:font/ttf;base64,\${bold.toString("base64")}) format("truetype"); }\`;
}

export function imgDataUrl(fileName: string): string | null {
  const full = path.join(BROCHURE_SHOT_DIR, fileName);
  if (!fs.existsSync(full)) return null;
  return \`data:image/png;base64,\${fs.readFileSync(full).toString("base64")}\`;
}

export function loadLogo(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "logos", "logo-night.png"),
    path.join(process.cwd(), "assets", "logo-bsd-ybm-center.png"),
    path.join(process.cwd(), "assets", "logo-bsd-ybm-official.png"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return \`data:image/png;base64,\${fs.readFileSync(candidate).toString("base64")}\`;
    }
  }
  return null;
}
`;

const m = s.match(/type FeatureCard[\s\S]*?const ACCENTS = \[[\s\S]*?\];\n\n/);
if (!m) {
  console.error("no match");
  process.exit(1);
}

let dataBlock = m[0]
  .replace(/^type /, "export type ")
  .replace(/^const ICONS/, "export const ICONS")
  .replace(/^const SHOWCASES/, "export const SHOWCASES")
  .replace(/^const TECH_STACK/, "export const TECH_STACK")
  .replace(/^const AUDIENCES/, "export const AUDIENCES")
  .replace(/^const ACCENTS/, "export const ACCENTS");

fs.writeFileSync("lib/pdf/product-brochure-v2-assets.ts", assets);
fs.writeFileSync("lib/pdf/product-brochure-v2-data.ts", dataBlock);

const newMain = `import { escapeHtml } from "@/lib/pdf/invoice-labels";
import { fontFaceCss, imgDataUrl, loadLogo } from "@/lib/pdf/product-brochure-v2-assets";
import {
  type Showcase,
  SHOWCASES,
  ICONS,
  TECH_STACK,
  AUDIENCES,
  ACCENTS,
} from "@/lib/pdf/product-brochure-v2-data";

${s.slice(s.indexOf("function showcaseSection"))}`;

fs.writeFileSync(p, newMain);
console.log("split ok", fs.statSync("lib/pdf/product-brochure-v2-data.ts").size, fs.statSync(p).size);
