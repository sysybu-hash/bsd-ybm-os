/**
 * מעתיק לוגואים נקיים ל-public/logos (מקור: assets/brand/logo-*-master.png).
 * קנבס אחיד לפי גובה לוגו הלילה — יום ולילה באותו גודל תצוגה.
 * לוגו יום: רקע לבן → שקוף.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const DAY_MASTER = path.join(ROOT, "assets", "brand", "logo-day-master.png");
const NIGHT_MASTER = path.join(ROOT, "assets", "brand", "logo-night-master.png");
const OUT = path.join(ROOT, "public", "logos");
const OUT_W = 560;

/** הופך פיקסלים לבנים/כמעט-לבנים לשקופים */
async function stripNearWhite(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 255;
    if (a > 0 && r >= 238 && g >= 238 && b >= 238) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function trimLogo(masterPath, stripWhite) {
  let buf = await sharp(masterPath).trim({ threshold: 18 }).png().toBuffer();
  if (stripWhite) {
    buf = await stripNearWhite(buf);
  }
  return buf;
}

async function fitToCanvas(trimmedBuf, canvasW, canvasH) {
  return sharp(trimmedBuf)
    .resize(canvasW, canvasH, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function exportPair() {
  if (!fs.existsSync(DAY_MASTER) || !fs.existsSync(NIGHT_MASTER)) {
    throw new Error("חסרים logo-day-master.png או logo-night-master.png ב-assets/brand/");
  }

  const nightTrim = await trimLogo(NIGHT_MASTER, false);
  const dayTrim = await trimLogo(DAY_MASTER, true);

  const nightMeta = await sharp(nightTrim).metadata();
  const nw = nightMeta.width ?? OUT_W;
  const nh = nightMeta.height ?? 320;
  const canvasH = Math.round(nh * (OUT_W / nw));

  const nightOut = await fitToCanvas(nightTrim, OUT_W, canvasH);
  const dayOut = await fitToCanvas(dayTrim, OUT_W, canvasH);

  fs.mkdirSync(OUT, { recursive: true });
  await sharp(nightOut).toFile(path.join(OUT, "logo-night.png"));
  await sharp(dayOut).toFile(path.join(OUT, "logo-day.png"));

  const appIcon = await sharp(nightOut)
    .resize(512, Math.round(512 * (canvasH / OUT_W)), {
      fit: "contain",
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(appIcon).toFile(path.join(ROOT, "public", "logo.png"));

  return { width: OUT_W, height: canvasH };
}

async function main() {
  const dims = await exportPair();
  console.log("logo-day.png + logo-night.png", dims);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
