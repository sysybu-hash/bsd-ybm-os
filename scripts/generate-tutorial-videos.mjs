/**
 * יוצר שלושה קבצי MP4 להדרכת הנחיתה (~10 שניות, לולאה חלקה).
 * דורש ffmpeg ב-PATH (winget install Gyan.FFmpeg).
 * פונט: Windows — Segoe UI; אחרת הגדר TUTORIAL_VIDEO_FONT=נתיב/ל/font.ttf
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "tutorials");

const DEFAULT_FONTS = [
  "C:/Windows/Fonts/segoeuib.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
];

function resolveFontPath() {
  const env = process.env.TUTORIAL_VIDEO_FONT?.trim();
  if (env && existsSync(env)) return env;
  for (const p of DEFAULT_FONTS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function runFfmpeg(args) {
  const r = spawnSync("ffmpeg", args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
}

function escFontPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

mkdirSync(OUT_DIR, { recursive: true });

const font = resolveFontPath();
const draw = font
  ? (text, x, y, size, color = "white") =>
      `drawtext=fontfile='${escFontPath(font)}':text='${text}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}:borderw=2:bordercolor=black@0.35`
  : null;

const baseOut = [
  "-t",
  "10",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-crf",
  "20",
  "-preset",
  "medium",
  "-movflags",
  "+faststart",
];

const baseInSlate = ["-y", "-f", "lavfi", "-i", "color=c=0x0f172a:s=1280x720:r=30"];
const baseInViolet = ["-y", "-f", "lavfi", "-i", "color=c=0x1e1b4b:s=1280x720:r=30"];

// CRM: כותרת + 3 כרטיסים + הדגשה מחזורית + נקודת מיקוד נעה
const crmParts = [
  "drawbox=x=100:y=120:w=1080:h=4:color=0x3b82f6@0.6:t=fill",
  "drawbox=x=140:y=200:w=1000:h=72:color=white@0.08:t=fill",
  "drawbox=x=140:y=292:w=1000:h=72:color=white@0.08:t=fill",
  "drawbox=x=140:y=384:w=1000:h=72:color=white@0.08:t=fill",
  // הדגשה על שורה לפי מחזור ~3.3 שניות
  "drawbox=x=136:y='if(eq(mod(floor(t*3)\\,3)\\,0)\\,196\\,if(eq(mod(floor(t*3)\\,3)\\,1)\\,288\\,380))':w=1008:h=80:color=0x3b82f6@0.22:t=fill",
  "drawbox=x=140:y=200:w=1000:h=72:color=white@0.06:t=fill",
  "drawbox=x=140:y=292:w=1000:h=72:color=white@0.06:t=fill",
  "drawbox=x=140:y=384:w=1000:h=72:color=white@0.06:t=fill",
  "drawbox=x='140+820*mod(t\\,10)/10':y=248:w=36:h=36:color=0x60a5fa:t=fill",
  "drawbox=x='140+820*mod(t\\,10)/10'+8:y=256:w=20:h=20:color=0x93c5fd:t=fill",
];
if (draw) {
  crmParts.push(draw("CRM", 140, 78, 44, "0x93c5fd"));
  crmParts.push(draw("לידים וצוות", 140, 128, 22, "white@0.85"));
}
const crmVf = crmParts.join(",");

// ERP: כותרת + 4 עמודות + קו בסיס
const erpBars = [0, 0.95, 1.85, 2.75]
  .map(
    (phase, i) =>
      `drawbox=x=${232 + i * 168}:y='ih*0.88-max(52\\,260*(0.35+0.65*(0.5+0.5*sin(2*PI*t/10+${phase}))))':w=118:h='max(52\\,260*(0.35+0.65*(0.5+0.5*sin(2*PI*t/10+${phase}))))':color=${
        ["0x34d399", "0x2dd4bf", "0x14b8a6", "0x22d3ee"][i]
      }:t=fill`,
  )
  .join(",");
const erpParts = [
  "drawbox=x=100:y=110:w=1080:h=4:color=0x34d399@0.55:t=fill",
  "drawbox=x=200:y=628:w=880:h=3:color=white@0.15:t=fill",
  erpBars,
];
if (draw) {
  erpParts.push(draw("ERP", 140, 68, 44, "0x6ee7b7"));
  erpParts.push(draw("תזרים ודוחות", 140, 118, 22, "white@0.85"));
}
const erpVf = erpParts.filter(Boolean).join(",");

// סורק: מסגרת מסמך, שורות dummy, קו סריקה, פס התקדמות
const scannerParts = [
  "drawbox=x=300:y=140:w=680:h=400:color=0x312e81@0.5:t=fill",
  "drawbox=x=320:y=160:w=640:h=360:color=white@0.07:t=fill",
  "drawbox=x=360:y=220:w=240:h=10:color=white@0.12:t=fill",
  "drawbox=x=360:y=250:w=180:h=10:color=white@0.08:t=fill",
  "drawbox=x=360:y=300:w=200:h=10:color=white@0.08:t=fill",
  "drawbox=x=320:y='160+340*(0.5+0.5*sin(2*PI*t/10))':w=640:h=8:color=0xe9d5ff@0.95:t=fill",
  "drawbox=x=320:y='160+340*(0.5+0.5*sin(2*PI*t/10))':w=640:h=2:color=white@0.9:t=fill",
  "drawbox=x=380:y=580:w=520:h=14:color=white@0.12:t=fill",
  "drawbox=x=380:y=580:w='520*mod(t\\,10)/10':h=14:color=0xa78bfa:t=fill",
];
if (draw) {
  scannerParts.push(draw("סריקת מסמכים", 140, 58, 40, "0xc4b5fd"));
  scannerParts.push(draw("חשבוניות וקבלות", 140, 108, 22, "white@0.88"));
}
const scannerVf = scannerParts.join(",");

const jobs = [
  { name: "crm.mp4", input: baseInSlate, vf: crmVf },
  { name: "erp.mp4", input: baseInSlate, vf: erpVf },
  { name: "scanner.mp4", input: baseInViolet, vf: scannerVf },
];

console.log(font ? `פונט: ${font}` : "ללא drawtext (לא נמצא פונט — רק צורות)");

for (const { name, input, vf } of jobs) {
  const out = path.join(OUT_DIR, name);
  runFfmpeg([...input, "-vf", vf, ...baseOut, out]);
  console.log("נוצר:", out);
}

console.log("סיום generate-tutorial-videos");
