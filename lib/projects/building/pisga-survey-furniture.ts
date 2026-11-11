import type { Primitive } from "@/lib/projects/building/model";
import { surveySegments, type PisgaSurvey } from "@/lib/projects/building/pisga-survey";
import { singleFaces } from "@/lib/projects/building/pisga-survey-street";

type Pt = [number, number];

/**
 * The street furniture the 2022 survey marks, each where the surveyor put it (the survey's codes; labels in DOS Hebrew):
 *  - M4402 "עמוד תאורה": a street light, an 8 m grey pole whose 1.5 m arm reaches toward the nearest kerb (M2404);
 *  - M4804 / M4610 "שוחת ביוב", M4807 "מפל", M4001 "גוב תקשורת": a manhole's cast cover, 60 cm across, flush with the surface;
 *  - M4616 "זקף מים": a water riser, a red standpipe 80 cm high;
 *  - M2442 "תמרור": a road sign, a 2.6 m pole with its plate turned to the nearest kerb;
 *  - M2612 "מחסום": a barrier, red-and-white bar on two posts along the surveyed line;
 *  - M2417 "אבן גן": a garden kerb, 10 cm over the ground;
 *  - M2812 "סלעים": a line of rocks (both its edges drawn, 30–40 cm apart), as stones half sunk along its middle.
 * The survey is the site as it stood; every piece stands on the model's surface where it is, which is the design's where it moved the ground.
 */
export function surveyFurniturePrims(survey: PisgaSurvey, topAt: (x: number, z: number) => number): Primitive[] {
  const out: Primitive[] = [];
  const kerbs = surveySegments(survey, "M2404");
  const nearestKerb = (x: number, z: number): Pt | null => {
    let best: Pt | null = null, bd = Infinity;
    for (const [a, b] of kerbs) {
      const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / l2));
      const q: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const d = Math.hypot(q[0] - x, q[1] - z);
      if (d < bd) { bd = d; best = q; }
    }
    return best && bd < 15 ? best : null;
  };

  for (const m of survey.marks) {
    const { x, z } = m;
    if (m.layer === "M4402") {
      const y = topAt(x, z);
      out.push({ type: "cylinder", centre: { x, y: y + 4, z }, radius: 0.08, height: 8, material: "metal", tag: "site:survey-lamp" });
      const k = nearestKerb(x, z);
      if (k) {
        const d = Math.hypot(k[0] - x, k[1] - z) || 1;
        const [ux, uz] = [(k[0] - x) / d, (k[1] - z) / d];
        const [hx, hz] = [x + ux * 1.5, z + uz * 1.5];
        const rotY = Math.atan2(ux, uz);
        out.push({ type: "box", centre: { x: (x + hx) / 2, y: y + 7.95, z: (z + hz) / 2 }, size: { x: 0.06, y: 0.06, z: 1.5 }, rotY, material: "metal", tag: "site:survey-lamp" });
        out.push({ type: "box", centre: { x: hx, y: y + 7.9, z: hz }, size: { x: 0.25, y: 0.1, z: 0.55 }, rotY, material: "metal", tag: "site:survey-lamp" });
      } else out.push({ type: "box", centre: { x, y: y + 8.05, z }, size: { x: 0.4, y: 0.12, z: 0.4 }, material: "metal", tag: "site:survey-lamp" });
    } else if (m.layer === "M4804" || m.layer === "M4610" || m.layer === "M4807" || m.layer === "M4001") {
      // Where the design moved the ground the shaft stays and its cover is raised or lowered to the new surface (the user, 2026-11-09).
      const y = topAt(x, z);
      out.push({ type: "cylinder", centre: { x, y: y + 0.008, z }, radius: 0.3, height: 0.02, material: "darkSteel", tag: "site:survey-manhole" });
    } else if (m.layer === "M4616") {
      const y = topAt(x, z);
      out.push({ type: "cylinder", centre: { x, y: y + 0.4, z }, radius: 0.06, height: 0.8, material: "kerbRed", tag: "site:survey-water-riser" });
      out.push({ type: "cylinder", centre: { x, y: y + 0.82, z }, radius: 0.09, height: 0.06, material: "kerbRed", tag: "site:survey-water-riser" });
    } else if (m.layer === "M2442") {
      const y = topAt(x, z);
      out.push({ type: "cylinder", centre: { x, y: y + 1.3, z }, radius: 0.03, height: 2.6, material: "metal", tag: "site:survey-sign" });
      const k = nearestKerb(x, z);
      const rotY = k ? Math.atan2(k[0] - x, k[1] - z) : 0;
      out.push({ type: "box", centre: { x, y: y + 2.3, z }, size: { x: 0.6, y: 0.6, z: 0.02 }, rotY, material: "signage", tag: "site:survey-sign" });
    }
  }

  // The barrier: its surveyed line, posts at the ends and a red-and-white bar a metre up.
  for (const l of survey.lines.filter((q) => q.layer === "M2612" && q.pts.length >= 2)) {
    const [a, b] = [l.pts[0]!, l.pts[l.pts.length - 1]!];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.3) continue;
    const rotY = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (const p of [a, b]) out.push({ type: "cylinder", centre: { x: p[0], y: topAt(p[0], p[1]) + 0.55, z: p[1] }, radius: 0.05, height: 1.1, material: "metal", tag: "site:survey-barrier" });
    const n = Math.max(2, Math.round(len / 0.5));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      out.push({ type: "box", centre: { x, y: topAt(a[0], a[1]) + 1.0, z }, size: { x: len / n, y: 0.08, z: 0.05 }, rotY, material: k % 2 ? "parkingLine" : "kerbRed", tag: "site:survey-barrier" });
    }
  }

  // The garden kerbs: both faces are drawn; one kerb per pair, 10 cm wide and 10 cm over the ground.
  const garden = singleFaces(survey.lines.filter((q) => q.layer === "M2417" && q.pts.length >= 2));
  for (const pts of garden) {
    out.push({
      type: "custom-mesh",
      stations: pts.map(([x, z]) => ({ x, z, yFoot: topAt(x, z) - 0.1, yTop: topAt(x, z) + 0.1 })),
      thick: 0.1,
      material: "stone",
      tag: "site:survey-garden-kerb",
    });
  }
  // The rock lines: the middle of each pair of edges, a stone every 0.7 m, each a low irregular block, half under the ground.
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const pts of singleFaces(survey.lines.filter((q) => q.layer === "M2812" && q.pts.length >= 2))) {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1]!, pts[i]!];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0.35; s < len; s += 0.7) {
        const x = a[0] + ((b[0] - a[0]) * s) / len + 0.15 * ((b[1] - a[1]) / len), z = a[1] + ((b[1] - a[1]) * s) / len - 0.15 * ((b[0] - a[0]) / len);
        const r = 0.25 + rnd() * 0.15, y = topAt(x, z), k = 6, rot = rnd() * Math.PI;
        const ring: Pt[] = Array.from({ length: k }, (_, j) => { const ang = rot + (j / k) * Math.PI * 2, rr = r * (0.75 + rnd() * 0.35); return [x + rr * Math.cos(ang), z + rr * Math.sin(ang)]; });
        out.push({ type: "prism", ring, y0: y - 0.25, y1: y + 0.2 + rnd() * 0.2, material: "rock", tag: "site:survey-rocks" });
      }
    }
  }
  return out;
}
