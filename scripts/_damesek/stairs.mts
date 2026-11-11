// Scratch (Damesek Eliezer dedicated builder): the stairs, as the plans number them. Delete when done.
//
// Revit numbers every riser of a stair on the plan (A-FLOR-IDEN), counted from the ground up through every storey (the north
// stair 1..96, +16.32 at 96 × 17 cm), and writes each flight's formula beside it ("12 X 17.00 = 204"). A tread is the number's
// place on the plan: its run is the chain of numbers 28 cm apart, its width the tread lines (A-FLOR-STRS) across that chain, its
// top the number × the riser. Every plan draws the flights it cuts and the ones seen below, so the numbers of all the plans,
// together, are the whole stair.
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";

export type Tread = { stair: number; n: number; x0: number; x1: number; y0: number; y1: number; top: number; flight: number; dirX: number; dirY: number };
export type Stair = { id: number; treads: Tread[]; riser: number; box: { x0: number; x1: number; y0: number; y1: number }; descending: boolean };

type Label = { n: number; x: number; y: number };

export function readStairs(plans: DxfPiece[][], opts: { riserDefault?: number } = {}): { stairs: Stair[]; report: Record<string, unknown> } {
  const report: Record<string, unknown> = {};
  // ---- the numbers: integers on A-FLOR-IDEN that are not a formula's pieces ("11", "X", "28", "=", "308")
  const labels: Label[] = [];
  const riserTexts: Array<{ h: number; x: number; y: number }> = [];
  const lines: Array<{ a: Pt; b: Pt }> = [];
  const marks: Array<{ v: number; x: number; y: number }> = [];
  plans.forEach((ps) => {
    const T = ps.filter((p) => p.layer === "A-FLOR-IDEN" && p.text && p.at);
    const ops = T.filter((p) => /^\s*[X=]\s*$/.test(p.text!));
    // written along x or, turned, along y (the east stair's "8 X 17.00 = 136" stands upright)
    const inFormula = (q: Pt) => ops.filter((o) => Math.abs(o.at!.y - q.y) < 4 && Math.abs(o.at!.x - q.x) < 45).length >= 2 || ops.filter((o2) => Math.abs(o2.at!.x - q.x) < 4 && Math.abs(o2.at!.y - q.y) < 45).length >= 2;
    for (const p of T) {
      const s = p.text!.trim();
      if (/^\d{1,3}$/.test(s) && !inFormula(p.at!)) labels.push({ n: +s, x: p.at!.x, y: p.at!.y });
      if (/^\d{2}\.\d{2}$/.test(s)) riserTexts.push({ h: +s, x: p.at!.x, y: p.at!.y });
    }
    for (const p of ps) {
      if (p.layer === "A-FLOR-STRS" && p.pts) for (let j = 0; j + 1 < p.pts.length; j++) lines.push({ a: p.pts[j]!, b: p.pts[j + 1]! });
      if (p.layer === "A-ANNO-DIMS" && p.text && p.at) { const m = /^([+-])(\d+\.\d\d)$/.exec(p.text.trim()); if (m) marks.push({ v: (m[1] === "-" ? -1 : 1) * +m[2]! * 100, x: p.at.x, y: p.at.y }); }
    }
  });
  // ---- one place a number: the same number at the same spot in several plans is one riser
  const uniq: Label[] = [];
  for (const l of labels) if (!uniq.some((u) => u.n === l.n && Math.hypot(u.x - l.x, u.y - l.y) < 8)) uniq.push(l);
  // ---- chains: n beside n + 1, 20..40 cm apart (a flight's numbers)
  const nextOf = new Map<Label, Label>();
  for (const l of uniq) {
    const nx = uniq.filter((u) => u.n === l.n + 1 && Math.hypot(u.x - l.x, u.y - l.y) > 18 && Math.hypot(u.x - l.x, u.y - l.y) < 42).sort((p, q) => Math.hypot(p.x - l.x, p.y - l.y) - Math.hypot(q.x - l.x, q.y - l.y))[0];
    if (nx) nextOf.set(l, nx);
  }
  const prevOf = new Map<Label, Label>();
  for (const [a, b] of nextOf) if (!prevOf.has(b)) prevOf.set(b, a);
  const flights: Label[][] = [];
  for (const l of uniq) {
    if (prevOf.has(l) && nextOf.get(prevOf.get(l)!) === l) continue; // not a chain's start
    const ch = [l];
    let c = l;
    while (nextOf.has(c) && prevOf.get(nextOf.get(c)!) === c) { c = nextOf.get(c)!; ch.push(c); }
    // straight: a flight's numbers on one line
    if (ch.length >= 3) flights.push(ch);
  }
  // ---- the tread lines' width across each flight
  const treadsOf: Tread[] = [];
  const flightInfo: Array<{ x0: number; x1: number; y0: number; y1: number; from: number; to: number }> = [];
  flights.forEach((ch, fi) => {
    const a = ch[0]!, b = ch.at(-1)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    const axisX = Math.abs(ux) > Math.abs(uy); // the climb along x
    const d = L / (ch.length - 1);
    // lines across the climb that the chain's line crosses, inside the chain's reach
    const across = lines.filter(({ a: p, b: q }) => {
      const lx = q.x - p.x, ly = q.y - p.y, ll = Math.hypot(lx, ly);
      if (ll < 60 || ll > 400) return false;
      if (Math.abs((lx / ll) * ux + (ly / ll) * uy) > 0.1) return false; // perpendicular to the climb
      const s = ((p.x + q.x) / 2 - a.x) * ux + ((p.y + q.y) / 2 - a.y) * uy;
      if (s < -d || s > L + d) return false;
      const t0 = (p.x - a.x) * -uy + (p.y - a.y) * ux, t1 = (q.x - a.x) * -uy + (q.y - a.y) * ux;
      return Math.min(t0, t1) < 2 && Math.max(t0, t1) > -2;
    });
    let lo: number, hi: number;
    if (across.length) {
      const los: number[] = [], his: number[] = [];
      for (const { a: p, b: q } of across) {
        const t0 = (p.x - a.x) * -uy + (p.y - a.y) * ux, t1 = (q.x - a.x) * -uy + (q.y - a.y) * ux;
        los.push(Math.min(t0, t1)); his.push(Math.max(t0, t1));
      }
      los.sort((p, q) => p - q); his.sort((p, q) => p - q);
      lo = los[Math.floor(los.length / 2)]!; hi = his[Math.floor(his.length / 2)]!;
    } else { lo = -55; hi = 55; }
    for (const l of ch) {
      const s = (l.x - a.x) * ux + (l.y - a.y) * uy;
      const corners = [[s - d / 2, lo], [s + d / 2, lo], [s + d / 2, hi], [s - d / 2, hi]].map(([ss, tt]) => ({ x: a.x + ux * ss! - uy * tt!, y: a.y + uy * ss! + ux * tt! }));
      const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
      treadsOf.push({ stair: -1, n: l.n, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), top: 0, flight: fi, dirX: ux, dirY: uy });
    }
    const fx = treadsOf.filter((t) => t.flight === fi);
    flightInfo.push({ x0: Math.min(...fx.map((t) => t.x0)), x1: Math.max(...fx.map((t) => t.x1)), y0: Math.min(...fx.map((t) => t.y0)), y1: Math.max(...fx.map((t) => t.y1)), from: a.n, to: b.n });
    void axisX;
  });
  // ---- stairs: flights whose numbers continue one another (n's end + 1 = the next's start) and lie within a stair room's reach
  const parent = flightInfo.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const near = (p: (typeof flightInfo)[number], q: (typeof flightInfo)[number], m: number) => Math.max(p.x0 - q.x1, q.x0 - p.x1, 0) < m && Math.max(p.y0 - q.y1, q.y0 - p.y1, 0) < m;
  flightInfo.forEach((p, i) => flightInfo.forEach((q, j) => { if (j > i && near(p, q, 260)) parent[find(i)] = find(j); }));
  const groups = new Map<number, number[]>();
  flightInfo.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
  const stairs: Stair[] = [];
  let id = 0;
  for (const fis of groups.values()) {
    const ts = treadsOf.filter((t) => fis.includes(t.flight));
    const box = { x0: Math.min(...ts.map((t) => t.x0)), x1: Math.max(...ts.map((t) => t.x1)), y0: Math.min(...ts.map((t) => t.y0)), y1: Math.max(...ts.map((t) => t.y1)) };
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    const rt = riserTexts.filter((r) => r.x > box.x0 - 150 && r.x < box.x1 + 150 && r.y > box.y0 - 150 && r.y < box.y1 + 150);
    const riser = rt.length ? rt.map((r) => r.h).sort((p, q) => p - q)[Math.floor(rt.length / 2)]! : opts.riserDefault ?? 17;
    // a stair counted down into a pit (a mikveh's steps): a level mark under ±0 beside it, and no number past a storey
    const maxN = Math.max(...ts.map((t) => t.n));
    const low = marks.filter((m) => m.v < -20 && m.x > box.x0 - 150 && m.x < box.x1 + 150 && m.y > box.y0 - 150 && m.y < box.y1 + 150);
    const top0 = marks.filter((m) => m.v >= 0 && m.v < 60 && m.x > box.x0 - 200 && m.x < box.x1 + 200 && m.y > box.y0 - 200 && m.y < box.y1 + 200);
    // a pit's steps: only on the ground plan's numbers, under a storey's height, and a pit's level mark near (the mikveh's "-1.38";
    // its pools beside it carry none, but are the same kind of stair: 9 risers, nothing above)
    const descending = maxN * riser < 300 && (low.length > 0 || maxN <= 12);
    // its numbers still count up, from the pit's floor: the ninth riser is the floor it is entered from (+0.15 at the rabbi's
    // mikveh: 0.15 − 9 × 0.17 = −1.38, the pit's own mark)
    const entry = top0.sort((p, q) => p.v - q.v)[0]?.v ?? 0;
    const base = descending ? entry - maxN * riser : 0;
    // the numbers the plans leave out (under a cut, behind a rail): a storey's flights repeat, so riser n stands where n ± one
    // storey's risers stands; a pit's first steps go on down its flight
    // the repeat is read off the numbers themselves: the smallest step p for which n and n + p stand on one spot (a storey's 24
    // round a well; 16 where a narrow stair's flights go two by two, the third over the first)
    const have = new Map(ts.map((t) => [t.n, t] as const));
    const ctr = (t: Tread) => [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2] as const;
    let period = Math.round(408 / riser);
    for (let pp = 4; pp <= 48; pp++) {
      let agree = 0, all = 0;
      for (const t of have.values()) { const u = have.get(t.n + pp); if (!u) continue; all++; const [a0, a1] = ctr(t), [b0, b1] = ctr(u); if (Math.hypot(a0 - b0, a1 - b1) < 15) agree++; }
      if (agree >= 3 && agree >= 0.8 * all) { period = pp; break; }
    }
    (report.period ??= {} as Record<number, number>);
    (report.period as Record<number, number>)[id] = period;
    let filled = 0;
    for (let k = 1; k <= maxN; k++) {
      if (have.has(k)) continue;
      // its copies a repeat away; the one beside its neighbours (n − 1, n + 1) wins: a storey's flights shift round the well
      // where its floor landing takes a flight's place (the north stair at +8.16), so n + 24 is not always over n
      const cands = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6].map((m) => have.get(k + m * period)).filter((t): t is Tread => t != null);
      const nb = [have.get(k - 1), have.get(k + 1)].filter((t): t is Tread => t != null);
      const besideNb = (t: Tread) => nb.some((u) => { const [a0, a1] = ctr(t), [b0, b1] = ctr(u); return Math.hypot(a0 - b0, a1 - b1) < 45; });
      const src = cands.find(besideNb) ?? cands[0];
      if (src && !descending) { const t = { ...src, n: k }; ts.push(t); have.set(k, t); filled++; continue; }
      // the flight's own line, stepped back from its lowest number
      const nextUp = [...have.values()].filter((t) => t.n > k).sort((p, q) => p.n - q.n)[0];
      if (nextUp && treadsOf.some((t) => t.flight === nextUp.flight && t.n === nextUp.n + 1)) {
        const dn = nextUp.n - k, dx = (nextUp.x1 - nextUp.x0), dy = (nextUp.y1 - nextUp.y0);
        const sx = Math.abs(nextUp.dirX) > 0.5 ? Math.sign(nextUp.dirX) * dx : 0, sy = Math.abs(nextUp.dirY) > 0.5 ? Math.sign(nextUp.dirY) * dy : 0;
        const t = { ...nextUp, n: k, x0: nextUp.x0 - sx * dn, x1: nextUp.x1 - sx * dn, y0: nextUp.y0 - sy * dn, y1: nextUp.y1 - sy * dn };
        // never out of the stair's own drawn reach (a step stepped back past its room's wall is a number misread)
        if (!descending && (t.x0 < box.x0 - 30 || t.x1 > box.x1 + 30 || t.y0 < box.y0 - 30 || t.y1 > box.y1 + 30)) { (report.unplaced ??= [] as string[]); (report.unplaced as string[]).push(`${id}:${k}`); continue; }
        ts.push(t); have.set(k, t); filled++;
      }
    }
    (report.filled ??= {} as Record<number, number>);
    (report.filled as Record<number, number>)[id] = filled;
    for (const t of ts) { t.stair = id; t.top = base + t.n * riser; }
    ts.sort((p, q) => p.n - q.n);
    stairs.push({ id, treads: ts, riser, box, descending });
    void cx; void cy;
    id++;
  }
  report.stairs = stairs.map((s) => ({ id: s.id, treads: s.treads.length, riser: s.riser, descending: s.descending, n: `${Math.min(...s.treads.map((t) => t.n))}..${Math.max(...s.treads.map((t) => t.n))}`, box: `X${s.box.x0.toFixed(0)}..${s.box.x1.toFixed(0)} Y${s.box.y0.toFixed(0)}..${s.box.y1.toFixed(0)}`, flights: new Set(s.treads.map((t) => t.flight)).size }));
  report.labels = { all: labels.length, unique: uniq.length, inFlights: treadsOf.length };
  return { stairs, report };
}
