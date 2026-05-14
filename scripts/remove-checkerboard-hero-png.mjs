/**
 * מסיר רקע „שקיפות מזויפת”: דוגמת שחמט אטומה.
 * 1) BFS מהשוליים (8־שכנויות) — כל מה שמחובר לקצה התמונה.
 * 2) כיסים סגורים בתוך אותיות (למשל החלל ב־ם סופית ב„כולם”) — רכיב קשיר של
 *    פיקסלים „משבצתיים” שלא נוגע בגבול התמונה → שקיפות.
 * 3) שוליים כמעט־לבנים ליד שקיפות בלבד (לא אוכל אפור של האותיות).
 *
 * קלט/פלט: public/landing-hero-title-art.png
 * הרצה: node scripts/remove-checkerboard-hero-png.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { renameSync, unlinkSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const input = join(root, "public", "landing-hero-title-art.png");
const tmp = join(root, "public", "landing-hero-title-art.tmp.png");
const output = join(root, "public", "landing-hero-title-art.png");

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function spread(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** רקע שחמט / אפור ניטרלי — לא זהב/נחושת עם פיזור ערוצים */
function isCheckerLike(r, g, b, maxSpread) {
  const l = lum(r, g, b);
  if (l < 105 || l > 278) return false;
  return spread(r, g, b) <= maxSpread;
}

const BFS_SPREAD = 30;

/** כיס שחמט פנימי (חלל בתוך אות) — רק רכיב שיש בו גם לבן משבצת וגם אפור */
const POCKET_LUM_LO = 118;
const POCKET_LUM_HI = 280;
const POCKET_MAX_SPREAD = 34;
const POCKET_MIN_AREA = 24;
const POCKET_MAX_AREA = 220_000;
const POCKET_MAX_SPREAD_COMP = 46;
const POCKET_MIN_MEAN_LUM = 155;
/** חייב להכיל „משבצת לבנה” ו„משבצת כהה” אופיינית לשחמט — לא מילוי מתכתי אחיד בכולם */
const POCKET_MIN_MAX_LUM = 242;
const POCKET_MAX_MIN_LUM = 218;

/** רק הילה כמעט־לבנה ליד שקיפות — לא נוגע באפור של האותיות */
const FRINGE_MIN_LUM = 248;
const FRINGE_MAX_SPREAD = 22;
const FRINGE_PASSES = 4;

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const ch = info.channels;
if (ch !== 4) {
  console.error("נדרש RGBA");
  process.exit(1);
}

function alphaAt(x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  return data[(y * w + x) * 4 + 3];
}

const visited = new Uint8Array(w * h);
const q = [];

function idx(x, y) {
  return y * w + x;
}

function tryPushBfs(x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const i = idx(x, y);
  if (visited[i]) return;
  const p = i * 4;
  const r = data[p];
  const g = data[p + 1];
  const b = data[p + 2];
  if (!isCheckerLike(r, g, b, BFS_SPREAD)) return;
  visited[i] = 1;
  q.push(x, y);
}

for (let x = 0; x < w; x++) {
  tryPushBfs(x, 0);
  tryPushBfs(x, h - 1);
}
for (let y = 0; y < h; y++) {
  tryPushBfs(0, y);
  tryPushBfs(w - 1, y);
}

const d8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

while (q.length) {
  const y = q.pop();
  const x = q.pop();
  for (const [dx, dy] of d8) tryPushBfs(x + dx, y + dy);
}

for (let i = 0; i < visited.length; i++) {
  if (visited[i]) data[i * 4 + 3] = 0;
}

function hasTransparentNeighbor8(x, y) {
  for (const [dx, dy] of d8) {
    if (alphaAt(x + dx, y + dy) < 20) return true;
  }
  return false;
}

function isNearWhiteFringe(r, g, b) {
  const l = lum(r, g, b);
  if (l < FRINGE_MIN_LUM) return false;
  return spread(r, g, b) <= FRINGE_MAX_SPREAD;
}

let removedFringe = 0;
for (let pass = 0; pass < FRINGE_PASSES; pass++) {
  let thisPass = 0;
  const toClear = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if (data[p + 3] < 20) continue;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (!isNearWhiteFringe(r, g, b)) continue;
      if (!hasTransparentNeighbor8(x, y)) continue;
      toClear.push(p);
    }
  }
  for (const p of toClear) {
    data[p + 3] = 0;
    thisPass++;
  }
  removedFringe += thisPass;
  if (thisPass === 0) break;
}

function isPocketCandidate(r, g, b) {
  const l = lum(r, g, b);
  if (l < POCKET_LUM_LO || l > POCKET_LUM_HI) return false;
  return spread(r, g, b) <= POCKET_MAX_SPREAD;
}

/** כיסי שחמט שלא נגעו בשולי הקובץ (למשל בתוך ם) */
const pocketVis = new Uint8Array(w * h);
let removedPockets = 0;

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    if (pocketVis[i]) continue;
    const p = i * 4;
    if (data[p + 3] < 20) continue;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    if (!isPocketCandidate(r, g, b)) continue;

    const stack = [x, y];
    const pixels = [];
    let touchesBitmapEdge = false;
    let maxSpComp = 0;
    let sumL = 0;
    let maxLComp = 0;
    let minLComp = 999;

    while (stack.length) {
      const cy = stack.pop();
      const cx = stack.pop();
      const ci = idx(cx, cy);
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
      if (pocketVis[ci]) continue;
      const bp = ci * 4;
      if (data[bp + 3] < 20) continue;
      const br = data[bp];
      const bg = data[bp + 1];
      const bb = data[bp + 2];
      if (!isPocketCandidate(br, bg, bb)) continue;

      pocketVis[ci] = 1;
      pixels.push(ci);
      const sp = spread(br, bg, bb);
      const lhere = lum(br, bg, bb);
      if (sp > maxSpComp) maxSpComp = sp;
      sumL += lhere;
      if (lhere > maxLComp) maxLComp = lhere;
      if (lhere < minLComp) minLComp = lhere;
      if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) touchesBitmapEdge = true;

      for (const [dx, dy] of d8) {
        stack.push(cx + dx, cy + dy);
      }
    }

    const area = pixels.length;
    const meanL = area > 0 ? sumL / area : 0;
    if (touchesBitmapEdge) continue;
    if (area < POCKET_MIN_AREA || area > POCKET_MAX_AREA) continue;
    if (maxSpComp > POCKET_MAX_SPREAD_COMP) continue;
    if (meanL < POCKET_MIN_MEAN_LUM) continue;
    if (maxLComp < POCKET_MIN_MAX_LUM) continue;
    if (minLComp > POCKET_MAX_MIN_LUM) continue;

    for (const pi of pixels) {
      data[pi * 4 + 3] = 0;
    }
    removedPockets += area;
  }
}

await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .png({ compressionLevel: 9, effort: 10 })
  .toFile(tmp);

if (existsSync(output)) unlinkSync(output);
renameSync(tmp, output);

let transparent = 0;
for (let a = 3; a < data.length; a += 4) {
  if (data[a] < 16) transparent++;
}
console.log(
  "עודכן:",
  output,
  `— שקופים: ${transparent}/${w * h} | שוליים: ${removedFringe} | כיסים פנימיים: ${removedPockets}`,
);
