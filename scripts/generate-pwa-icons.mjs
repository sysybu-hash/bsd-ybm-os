/**
 * אייקוני PWA + og-image + logo.png מהלוגו הכהה (logo-night).
 * הרצה: npm run icons:generate
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const NIGHT_LOGO = path.join(publicDir, "logos", "logo-night.png");
const ICON_BG = { r: 15, g: 23, b: 42, alpha: 1 };

async function compositeIcon(size, maskable) {
  if (!fs.existsSync(NIGHT_LOGO)) {
    throw new Error(`חסר ${NIGHT_LOGO} — הרץ קודם: npm run brand:prepare-assets`);
  }
  const pad = maskable ? Math.round(size * 0.14) : Math.round(size * 0.1);
  const inner = size - pad * 2;
  const logo = await sharp(NIGHT_LOGO)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ICON_BG,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 });
}

async function ogImage() {
  const w = 1200;
  const h = 630;
  const logoW = 420;
  const logo = await sharp(NIGHT_LOGO)
    .resize(logoW, Math.round(logoW * 0.69), {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  return sharp({
    create: { width: w, height: h, channels: 4, background: ICON_BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 });
}

async function main() {
  await (await compositeIcon(192, true)).toFile(path.join(publicDir, "icon-192.png"));
  await (await compositeIcon(512, true)).toFile(path.join(publicDir, "icon-512.png"));
  await (await ogImage()).toFile(path.join(publicDir, "og-image.png"));
  await (await compositeIcon(512, false)).toFile(path.join(publicDir, "logo.png"));
  console.log("OK: icon-192, icon-512, og-image, logo.png (מ-logo-night)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
