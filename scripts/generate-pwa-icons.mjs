/**
 * יוצר icon-192.png, icon-512.png ו-og-image.png בגדלים הנכונים (למניפסט ול-Open Graph).
 * הרצה: node scripts/generate-pwa-icons.mjs
 */
import sharp from "sharp";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

function iconSvg(size, maskable = false) {
  const r = maskable ? 0 : Math.round(size * 0.22);
  const fs = Math.round(size * 0.2);
  const padding = maskable ? Math.round(size * 0.1) : 0;
  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="${r}" fill="url(#g)"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
    font-family="Segoe UI,system-ui,sans-serif" font-weight="800" font-size="${fs}" fill="#ffffff">BSD</text>
</svg>`;
}

function ogSvg() {
  return `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f1f5f9"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="600" y="280" font-family="Segoe UI,system-ui,sans-serif" font-weight="900" font-size="72" fill="#0f172a" text-anchor="middle">BSD-YBM</text>
  <text x="600" y="360" font-family="Segoe UI,system-ui,sans-serif" font-weight="500" font-size="32" fill="#64748b" text-anchor="middle">AI · ERP · CRM</text>
</svg>`;
}

async function main() {
  await sharp(Buffer.from(iconSvg(192, true))).png().toFile(join(publicDir, "icon-192.png"));
  await sharp(Buffer.from(iconSvg(512, true))).png().toFile(join(publicDir, "icon-512.png"));
  await sharp(Buffer.from(ogSvg())).png().toFile(join(publicDir, "og-image.png"));
  console.log("OK: public/icon-192.png, icon-512.png, og-image.png (maskable)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
