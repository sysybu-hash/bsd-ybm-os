/** Elevation openings → plan face coordinates, and the plan-vs-elevation table per storey. Usage: <dxf> <report.json> */
import fs from "node:fs";
import { readElevOpenings, ELEVS, type ElevOpening } from "./elev-openings.mts";
export const LINE_SHIFT = 0.2; // the level mark's text stands 20 cm over its line
/** sheet → which plan walls it shows: hz = walls along x; side picks by the wall line; sign = how elevation x runs along the plan */
export const FACE: Record<string, { hz: boolean; far: boolean; sign: 1 | -1 }> = {
  "דרום": { hz: false, far: true, sign: 1 }, "צפון": { hz: false, far: false, sign: -1 },
  "מזרח": { hz: true, far: true, sign: -1 }, "מערב": { hz: true, far: false, sign: 1 },
};
export type PlanOp = { span: number[]; line: number; sill: number; head: number; hz?: boolean };
export const sideOf = (sheet: string, o: { line: number; hz: boolean }) => { const f = FACE[sheet]!; return o.hz === f.hz && (f.far ? o.line > (f.hz ? 900 : 1500) : o.line < (f.hz ? 900 : 1500)); };
/** best offset c (cm) so that s = sign·xLocal + c lines elevation centres on plan centres */
/** `along`: the elevation spans are already turned to run along the plan (sign applied, sheet origin taken off) */
export function fitOffset(sheet: string, elev: ElevOpening[], plan: Array<{ a: number; b: number }>, along = false): { c: number; hits: number } {
  const f = FACE[sheet]!, x0 = ELEVS.find((e) => e.sheet === sheet)!.x0;
  const ec = elev.map((o) => (along ? (o.x0 + o.x1) / 2 : f.sign * ((o.x0 + o.x1) / 2 - x0))), pc = plan.map((p) => (p.a + p.b) / 2);
  let best = { c: 0, hits: -1, err: 1e9 };
  for (let c = -4000; c <= 4000; c++) {
    let hits = 0, err = 0;
    for (const e of ec) { const d = Math.min(...pc.map((p) => Math.abs(p - (e + c)))); if (d < 15) { hits++; err += d; } }
    if (hits > best.hits || (hits === best.hits && err < best.err)) best = { c, hits, err };
  }
  return best;
}
if (process.argv[1]?.endsWith("elev-fit.mts")) {
  const el = readElevOpenings(process.argv[2]!);
  const rep = JSON.parse(fs.readFileSync(process.argv[3]!, "utf8"));
  const stA = rep.storeys.find((s: { id: string }) => s.id === "א");
  for (const sheet of Object.keys(FACE)) {
    const f = FACE[sheet]!, x0 = ELEVS.find((e) => e.sheet === sheet)!.x0;
    const hzOf = (o: { span: number[]; line: number }) => o.hz ?? false;
    void hzOf;
    const planOf = (s: { openingList: Array<{ span: number[]; line: number; face: string; sill: number; head: number }> }) => s.openingList.filter((o) => sideOf(sheet, { line: o.line, hz: /top|bottom/.test(o.face) || (o.face === "symbol" ? false : false) }));
    const pA = planOf(stA).map((o: { span: number[] }) => ({ a: o.span[0]!, b: o.span[1]! }));
    const eA = el.filter((o) => o.sheet === sheet && o.z0 + LINE_SHIFT >= 3.0 && o.z0 + LINE_SHIFT < 6.2);
    const fit = fitOffset(sheet, eA, pA);
    console.log(`== ${sheet}: c=${fit.c}, א ${fit.hits}/${eA.length} elevation openings on plan openings (${pA.length} in plan)`);
    for (const s of rep.storeys) {
      if (!s.openingList) continue;
      const L = s.level;
      const ps = planOf(s).map((o: { span: number[]; sill: number; head: number }) => `${o.span[0]}-${o.span[1]}/${o.sill}`).sort();
      const es = el.filter((o) => o.sheet === sheet && o.z0 + LINE_SHIFT - L >= -0.1 && o.z0 + LINE_SHIFT - L < 3.0).map((o) => { const a = f.sign * (o.x0 - x0) + fit.c, b = f.sign * (o.x1 - x0) + fit.c; return `${Math.round(Math.min(a, b))}-${Math.round(Math.max(a, b))}/${Math.round((o.z0 + LINE_SHIFT - L) * 100)}`; }).sort();
      console.log(`  ${s.id}: plan ${ps.length} [${ps.join(" ")}]\n      elev ${es.length} [${es.join(" ")}]`);
    }
  }
}
