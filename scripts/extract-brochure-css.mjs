import fs from "node:fs";

const path = "lib/pdf/product-brochure-v2-html.ts";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
const cssStart = lines.findIndex((l) => l.includes("* { box-sizing: border-box"));
const cssEnd = lines.findIndex((l) => l.trim() === "</style>");
const cssBody = lines.slice(cssStart, cssEnd).join("\n");

const out = `import { fontFaceCss } from "@/lib/pdf/product-brochure-v2-assets";

const PRODUCT_BROCHURE_V2_BASE_CSS = \`
${cssBody}
\`;

export function productBrochureV2StylesCss(): string {
  return fontFaceCss() + PRODUCT_BROCHURE_V2_BASE_CSS;
}
`;

fs.writeFileSync("lib/pdf/product-brochure-v2-styles.ts", out);
console.log(`Extracted ${cssEnd - cssStart} CSS lines`);
