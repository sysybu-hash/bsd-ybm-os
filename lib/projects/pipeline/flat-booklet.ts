/**
 * A flat's booklet in the system's design (buildProjectBookletHtml): the cover,
 * the orientation map beside the flat's part of the sheet, the plan from above,
 * each picture with a small map of where it was taken, the measured plan, and
 * at the end the assumptions the run made. The generic form of
 * scripts/_unit14-system-booklet.mts: no client texts, no logo, free renders.
 */
import sharp from "sharp";

import { buildProjectBookletHtml, type BookletImage, type PlanKey } from "@/lib/projects/building/booklet-html";
import { dollhousePixel, type FlatView } from "@/lib/projects/building/flat-model";
import { measuredPlanSvg } from "@/lib/projects/pipeline/flat-plan-svg";
import { areaOf, centreOf, dimsOf, f1, flatSpaces } from "@/lib/projects/pipeline/flat-spaces";
import type { FlatScene } from "@/lib/projects/scene3d/types";

const VIOLET = "#6d28d9";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const svgImage = (svg: string, width: number, height: number): BookletImage => ({ mimeType: "image/svg+xml", base64: Buffer.from(svg).toString("base64"), width, height });

async function jpeg(buf: Buffer): Promise<BookletImage> {
  const meta = await sharp(buf).metadata();
  return { mimeType: "image/jpeg", base64: buf.toString("base64"), width: meta.width, height: meta.height };
}

export async function flatBookletHtml(input: {
  projectName: string;
  unit: number;
  scene: FlatScene;
  views: FlatView[];
  pictures: Map<string, Buffer>;
  /** The flat's part of the sheet; no orientation page beside it when absent. */
  page: Buffer | null;
  assumptions: string[];
}): Promise<string> {
  const { scene, views, pictures } = input;
  const top = views.find((v) => v.id === "dollhouse");
  const topPicture = pictures.get("dollhouse");
  if (!top || !topPicture) throw new Error("flat booklet: the view from above did not draw");
  const plan = await jpeg(topPicture);
  const W = plan.width!;
  const H = plan.height!;
  const toImg = (x: number, z: number) => dollhousePixel(top, { width: W, height: H }, { x, y: 0, z });
  const pxPerM = toImg(1, 0).x - toImg(0, 0).x;
  const planHref = `data:image/jpeg;base64,${plan.base64}`;
  const { rooms, spaces, insideM2, outsideM2 } = flatSpaces(scene);

  const key: PlanKey = {
    rows: spaces.map((s, i) => ({ n: i + 1, name: esc(s.outside ? `${s.name} · חוץ` : s.name), dims: dimsOf(s), area: f1(areaOf(s.rects)) })),
    markers: spaces.map((s, i) => {
      const c = centreOf(s);
      const p = toImg(c.x, c.z);
      return { fx: p.x / W, fy: p.y / H, n: i + 1 };
    }),
    scale: { fraction: (2 * pxPerM) / W, metres: 2 },
    note: "עיגול לבן — מספר החלל במקרא. עיגול סגול וחרוט — מקום הצילום וכיוון המבט. המידות במטרים; השטחים נטו, נמדדו מהמודל. הכיוונים לפי ראש הגיליון.",
  };

  const shown = views.filter((v) => v.id !== "dollhouse" && pictures.has(v.id));
  const cone = (view: FlatView, n: number, lengthM: number, strong: boolean) => {
    const cam = view.payload.camera;
    const e = toImg(cam.position.x, cam.position.z);
    const l = toImg(cam.target.x, cam.target.z);
    const dir = Math.atan2(l.y - e.y, l.x - e.x);
    const half = Math.atan(Math.tan((cam.fovDeg * Math.PI) / 360) * (view.payload.width / view.payload.height));
    const r = lengthM * pxPerM;
    const at = (a: number) => `${(e.x + Math.cos(a) * r).toFixed(1)},${(e.y + Math.sin(a) * r).toFixed(1)}`;
    const dot = strong ? 30 : 24;
    return `<path d="M${e.x.toFixed(1)},${e.y.toFixed(1)} L${at(dir - half)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${at(dir + half)} Z" fill="${VIOLET}" fill-opacity="${strong ? 0.32 : 0.2}" stroke="${VIOLET}" stroke-width="${strong ? 5 : 3}" stroke-linejoin="round"/>
<circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="${dot}" fill="${VIOLET}" stroke="#fff" stroke-width="5"/>
<text x="${e.x.toFixed(1)}" y="${(e.y + dot * 0.36).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="${dot}" fill="#fff">${n}</text>`;
  };
  const over = (href: string, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image xlink:href="${href}" href="${href}" width="${W}" height="${H}"/>${body}</svg>`;
  const bigMap = svgImage(over(planHref, shown.map((v, i) => cone(v, i + 1, 2.4, false)).join("")), W, H);
  const smallHref = `data:image/jpeg;base64,${(await sharp(topPicture).resize(900).jpeg({ quality: 82 }).toBuffer()).toString("base64")}`;
  const smallMap = (v: FlatView, n: number) => svgImage(over(smallHref, `<rect width="${W}" height="${H}" fill="#fff" fill-opacity="0.18"/>${cone(v, n, 3.2, true)}`), W, H);

  const sheet = input.page ? await jpeg(await sharp(input.page).trim({ threshold: 20 }).jpeg({ quality: 90 }).toBuffer()) : null;
  const measured = measuredPlanSvg(scene, spaces);
  const flatName = `דירה ${input.unit}`;
  const bedrooms = rooms.filter((s) => s.name.startsWith("חדר שינה")).length;

  return buildProjectBookletHtml({
    projectName: `${input.projectName} · ${flatName}`,
    subtitle: "חוברת הדמיה מדודה · רינדור",
    hero: plan,
    kpis: [
      { label: "פנים נטו", value: `${f1(insideM2)} מ״ר` },
      { label: "מרפסות", value: `${f1(outsideM2)} מ״ר` },
      { label: "חדרי שינה", value: String(bedrooms) },
      { label: "הדמיות", value: String(shown.length + 1) },
    ],
    paragraphs: [
      `<b>בסיס:</b> הקירות, הפתחים, הריהוט והכלים הסניטריים נקראו מהשרטוט שהועלה ונבנו כמודל תלת־ממדי מדוד. התמונות הן רינדור של המודל, לא צביעה; הגמרים והצבעים להמחשה בלבד.`,
      ...(input.assumptions.length ? [`<b>הנחות:</b> ${input.assumptions.map(esc).join(" · ")}`] : []),
    ],
    tables: [
      {
        title: "שטחים (מ״ר, נמדדו מהמודל)",
        head: ["חלל", "מידות (מ׳)", "שטח"],
        rows: spaces.map((s) => [esc(s.outside ? `${s.name} · חוץ` : s.name), dimsOf(s), f1(areaOf(s.rects))]),
        foot: ["סה״כ", "", `פנים ${f1(insideM2)} · חוץ ${f1(outsideM2)}`],
      },
    ],
    chapters: [
      {
        name: flatName,
        hero: shown[0] ? await jpeg(pictures.get(shown[0].id)!) : plan,
        kpis: [
          { label: "פנים", value: `${f1(insideM2)} מ״ר` },
          { label: "מרפסות", value: `${f1(outsideM2)} מ״ר` },
        ],
        paragraphs: ["מבט על הדירה, ההדמיות מבפנים — כל אחת עם מפה קטנה של מקום הצילום וכיוון המבט — ובסוף התוכנית המדודה."],
        rooms: [],
        sheets: sheet ? [{ no: 1, title: "מפת התמצאות ומקרא", caption: "מבט על הדירה, החללים ממוספרים ומקום כל הדמיה מסומן. לצידו — הדירה בשרטוט שהועלה.", render: bigMap, sheet, key }] : [],
        plates: [
          { kicker: "מבט על", title: "הדירה כולה, מלמעלה", caption: "מבט ישר מלמעלה, הקירות חתוכים בגובה 1.10 מ׳. רינדור של המודל המדוד.", image: plan },
          ...(await Promise.all(shown.map(async (v, i) => ({ kicker: `הדמיה ${i + 1}`, title: esc(v.title), caption: "רינדור של המודל המדוד, מגובה עיניים.", image: await jpeg(pictures.get(v.id)!), locator: smallMap(v, i + 1) })))),
          { kicker: "תוכנית", title: "תוכנית מדודה", caption: "קירות, פתחים וכיווני פתיחה, שם כל חלל, מידותיו ושטחו. נמדד מהמודל; לביצוע — לפי תוכניות האדריכל.", image: svgImage(measured.svg, measured.width, measured.height) },
        ],
        report: input.assumptions.map(esc),
      },
    ],
  });
}
