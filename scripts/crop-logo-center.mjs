/**
 * חיתוך הלוגו — מוציא רק את העיגול המרכזי (4 האריחים) בלי המסגרת הכהה.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "assets", "logo-bsd-ybm-official.png");
const OUT = path.join(process.cwd(), "assets", "logo-bsd-ybm-center.png");

async function main() {
  const meta = await sharp(SRC).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;
  // המסגרת הכהה תופסת ~12% מכל צד. נחתוך 14% כדי לקבל רק את התוכן הצבעוני.
  const inset = Math.round(Math.min(w, h) * 0.14);
  const cropW = w - inset * 2;
  const cropH = h - inset * 2;

  // יצירת מסכת shape עגולה לקצוות חלקים — שומר על שקיפות מסביב.
  const size = Math.min(cropW, cropH);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <radialGradient id="g" cx="50%" cy="50%" r="50%">
           <stop offset="85%" stop-color="white" stop-opacity="1"/>
           <stop offset="100%" stop-color="white" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#g)"/>
     </svg>`,
  );

  await sharp(SRC)
    .extract({ left: inset, top: inset, width: cropW, height: cropH })
    .resize(size, size)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toFile(OUT);

  const stat = fs.statSync(OUT);
  console.log(`נוצר: ${OUT} (${stat.size.toLocaleString("he-IL")} bytes, ${size}×${size})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
