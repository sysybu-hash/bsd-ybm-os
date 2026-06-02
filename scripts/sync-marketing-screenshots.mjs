/**
 * מעתיק צילומי מסך מ-assets/product-brochure-v2 ל-public/screenshots (דף נחיתה, PWA).
 */
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "assets", "product-brochure-v2");
const DEST_DIR = path.join(process.cwd(), "public", "screenshots");

const MAP = [
  ["02-workspace-home.png", "workspace-home.png"],
  ["07-ai-hub.png", "ai-hub.png"],
  ["13-app-builder.png", "app-builder.png"],
  ["03-finance-hub.png", "finance-hub.png"],
  ["01-marketing-landing.png", "marketing-landing.png"],
];

fs.mkdirSync(DEST_DIR, { recursive: true });

let copied = 0;
for (const [srcName, destName] of MAP) {
  const src = path.join(SRC_DIR, srcName);
  const dest = path.join(DEST_DIR, destName);
  if (!fs.existsSync(src)) {
    console.warn(`דילוג — חסר: ${src}`);
    continue;
  }
  fs.copyFileSync(src, dest);
  const stat = fs.statSync(dest);
  console.log(`✓ ${destName} (${(stat.size / 1024).toFixed(0)} KB)`);
  copied++;
}

if (copied === 0) {
  console.error("לא הועתק אף קובץ — הריצו קודם: npm run product-brochure:capture:v2");
  process.exitCode = 1;
} else {
  console.log(`\n${copied} קבצים ב-${DEST_DIR}`);
}
