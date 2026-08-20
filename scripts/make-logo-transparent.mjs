// Removes the solid background "frame" from the brand logos, producing
// transparent-background variants. Keys out pixels close to the corner color
// with a smooth alpha falloff so the BY mark + wordmark survive intact.
import sharp from "sharp";
import path from "node:path";

const NEAR = 70; // <= this distance from bg → fully transparent
const FAR = 120; // >= this distance → fully opaque (smooth ramp in between)

async function makeTransparent(srcRel, outRel, bgOverride) {
  const SRC = path.resolve(srcRel);
  const OUT = path.resolve(outRel);

  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const px = (x, y) => (y * width + x) * channels;

  let br, bg, bb;
  if (bgOverride) {
    [br, bg, bb] = bgOverride;
  } else {
    const corners = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)];
    br = bg = bb = 0;
    for (const c of corners) {
      br += data[c];
      bg += data[c + 1];
      bb += data[c + 2];
    }
    br = Math.round(br / corners.length);
    bg = Math.round(bg / corners.length);
    bb = Math.round(bb / corners.length);
  }

  let cleared = 0;
  for (let i = 0; i < data.length; i += channels) {
    const dr = data[i] - br;
    const dg = data[i + 1] - bg;
    const db = data[i + 2] - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    let alpha;
    if (dist <= NEAR) alpha = 0;
    else if (dist >= FAR) alpha = 255;
    else alpha = Math.round(((dist - NEAR) / (FAR - NEAR)) * 255);
    if (alpha < 255) {
      data[i + channels - 1] = Math.min(data[i + channels - 1], alpha);
      if (alpha === 0) cleared++;
    }
  }

  await sharp(data, { raw: { width, height, channels } }).png().toFile(OUT);
  console.log(`${srcRel}: bg rgb(${br},${bg},${bb}) · cleared ${cleared}/${width * height} px → ${outRel}`);
}

await makeTransparent("public/logos/logo-night.png", "public/logos/logo-night-transparent.png");
await makeTransparent("public/logos/logo-day.png", "public/logos/logo-day-transparent.png", [255, 255, 255]);
