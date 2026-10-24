#!/usr/bin/env npx tsx
/**
 * The gate between the layer-mapping proposals and the model: which layers may go in without a person looking.
 *
 *   npx tsx --conditions=react-server scripts/cad-layer-gate.mts <mapper out dir> [<sibling out dir> ...]
 *
 * The first dir is the file gated; the others are the same project's other files (same office, same layer names), read for consistency.
 * A layer passes only when ALL of these hold:
 *   1. the text LLM answered the same kind in every run, sure (mean confidence ≥ 0.85), and not "unsure";
 *   2. at least one independent SUPPORT for what the layer means (not the proposing model's own text answer):
 *        - name rule: the profile of cad-layers.ts names it;  - block rule: the names of the blocks on it say it;  - picture: the vision pass agrees;
 *   2b. a kind that shapes the building (wall, door, window, stairs) needs two supports;
 *   3. no VETO: a support that says otherwise, the geometry's family (text / dimension / symbols / linework / fill) contradicting the kind,
 *      or the same layer in a sibling file proposed as something else (instability across files).
 * Geometry and the sibling files can only veto, never support: a sibling file shares the model's habits, and linework looks like linework
 * whichever wall it is — the TRESPA cladding/partition mix-up is invisible to both.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const { GENERIC_CAD_PROFILE, layerKind, blockKind } = await import("@/lib/projects/building/cad-layers");
const { truthFor, sameKind } = await import("./lib/cad-truth");

const args = process.argv.slice(2);
/** The geometry family is listed for the person but vetoes nothing, unless --geometry-veto: on Pisga its vetoes were 4 false alarms on the truth layers and no catch. */
const GEO_VETO = args.includes("--geometry-veto");
/** The kinds that shape the building (its walls, openings, stairs) need two independent supports, not one. */
const STRUCTURAL = new Set(["wall-ext", "wall-int", "door", "window", "stairs"]);
const [target, ...siblings] = args.filter((a) => !a.startsWith("--"));
if (!target) throw new Error("usage: <mapper out dir> [<sibling out dir> ...]");

type Stat = { name: string; pieces: number; segments: number; axisAlignedShare: number | null; closedShare: number | null; arcShare: number; textShare: number; dimShare: number; blockShare: number; solidHatches: number; blocks: string[] };
type Guess = { layer: string; kind: string; confidence: number; reason: string };
type Loaded = { dir: string; stats: Stat[]; runs: Guess[][]; vision: Map<string, Guess> };
const load = (dir: string): Loaded => {
  const stats = (JSON.parse(fs.readFileSync(path.join(dir, "layer-stats.json"), "utf8")) as Stat[]).filter((s) => s.pieces > 0);
  const r = JSON.parse(fs.readFileSync(path.join(dir, "llm-runs.json"), "utf8")) as { runs: Guess[][]; visionGuesses: Guess[] };
  return { dir, stats, runs: r.runs, vision: new Map(r.visionGuesses.map((g) => [g.layer, g])) };
};
const cls = (k: string | null | undefined) => (k === "wall-ext" || k === "wall-int" ? "wall" : k ?? "");
const text = (l: Loaded, name: string) => {
  const gs = l.runs.map((r) => r.find((g) => g.layer === name)).filter((g): g is Guess => Boolean(g));
  if (!gs.length) return null;
  const counts = new Map<string, number>();
  for (const g of gs) counts.set(g.kind, (counts.get(g.kind) ?? 0) + 1);
  const [kind, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const mine = gs.filter((g) => g.kind === kind);
  return { kind, agreement: n / gs.length, confidence: mine.reduce((a, g) => a + g.confidence, 0) / mine.length };
};
/** Which family of drawing content a kind is made of. */
const FAMILY: Record<string, string> = { text: "text", dimension: "dimension", furniture: "symbols", sanitary: "symbols", door: "symbols", parking: "symbols", tree: "symbols", bins: "symbols", planting: "symbols", "wall-ext": "linework", "wall-int": "linework", window: "linework", stairs: "linework", fence: "linework", railing: "linework", plot: "linework", overhead: "linework", paving: "fill", lawn: "fill" };
/** The family a layer's content clearly is, or null when it is mixed. */
function contentFamily(s: Stat): string | null {
  if (s.textShare >= 0.6) return "text";
  if (s.dimShare >= 0.3) return "dimension";
  if (s.solidHatches >= s.pieces * 0.5 && s.solidHatches > 0) return "fill";
  if (s.blockShare >= 0.6 || s.arcShare >= 0.4) return "symbols";
  if (s.segments > 0 && (s.axisAlignedShare ?? 0) >= 0.5 && s.textShare < 0.2 && s.blockShare < 0.3) return "linework";
  return null;
}
const blockSupport = (s: Stat): string | null => {
  const votes = new Map<string, number>();
  let all = 0;
  for (const b of s.blocks) {
    const m = /^(.*)×(\d+)$/.exec(b);
    if (!m) continue;
    const n = Number(m[2]);
    all += n;
    const k = blockKind(GENERIC_CAD_PROFILE, m[1]!, "");
    if (k) votes.set(cls(k), (votes.get(cls(k)) ?? 0) + n);
  }
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && all && top[1] / all >= 0.5 ? top[0] : null;
};

const t = load(target);
const sibs = siblings.map(load);
type Row = { warn?: string; layer: string; pieces: number; kind: string; accept: boolean; supports: string[]; vetoes: string[]; why: string; truth: string | null; correct: boolean | null };
const rows: Row[] = [];
for (const s of t.stats) {
  const tx = text(t, s.name);
  const supports: string[] = [], vetoes: string[] = [];
  let why = "";
  if (!tx) { rows.push({ layer: s.name, pieces: s.pieces, kind: "—", accept: false, supports, vetoes, why: "no answer", truth: truthFor(path.basename(target), s.name)?.kind ?? null, correct: null }); continue; }
  const k = cls(tx.kind);
  if (tx.kind === "unsure") why = "model unsure";
  else if (tx.agreement < 1) why = "runs disagree";
  else if (tx.confidence < 0.85) why = "confidence < 0.85";
  // supports: what the layer means, from sources other than this model's text answer
  const nameK = layerKind(GENERIC_CAD_PROFILE, s.name);
  if (nameK) (cls(nameK) === k ? supports : vetoes).push(`name-rule:${nameK}`);
  const bk = blockSupport(s);
  if (bk) (bk === k ? supports : vetoes).push(`block-rule:${bk}`);
  const v = t.vision.get(s.name);
  if (v && v.kind !== "unsure") (cls(v.kind) === k ? supports : vetoes).push(`picture:${v.kind}`);
  // vetoes only: geometry's family and the sibling files
  const fam = contentFamily(s);
  const geoMismatch = fam && FAMILY[tx.kind] && FAMILY[tx.kind] !== fam ? `geometry:${fam}≠${FAMILY[tx.kind]}` : null;
  if (geoMismatch && GEO_VETO) vetoes.push(geoMismatch);
  for (const sib of sibs) {
    const o = sib.stats.find((x) => x.name === s.name) ? text(sib, s.name) : null;
    if (o && o.kind !== "unsure" && cls(o.kind) !== k) vetoes.push(`${path.basename(sib.dir)}:${o.kind}`);
  }
  const need = STRUCTURAL.has(tx.kind) ? 2 : 1;
  const accept = !why && supports.length >= need && vetoes.length === 0;
  if (!why && supports.length === 0) why = "no independent support";
  else if (!why && supports.length < need) why = "structural kind: one support is not enough";
  if (!why && vetoes.length) why = "veto";
  const tr = truthFor(path.basename(target), s.name);
  rows.push({ layer: s.name, pieces: s.pieces, kind: tx.kind, accept, supports, vetoes, why, truth: tr?.kind ?? null, correct: tr ? sameKind(tx.kind, tr.kind) : null, ...(geoMismatch && !GEO_VETO ? { warn: geoMismatch } : {}) });
}
const total = rows.reduce((a, r) => a + r.pieces, 0);
const acc = rows.filter((r) => r.accept), hum = rows.filter((r) => !r.accept);
const pieces = (xs: Row[]) => xs.reduce((a, r) => a + r.pieces, 0);
const accTruth = acc.filter((r) => r.truth), humTruth = hum.filter((r) => r.truth);
const md: string[] = [];
md.push(`# שער: ${path.basename(target)}`, "", `קבצים אחים לאחידות: ${sibs.map((x) => path.basename(x.dir)).join(", ") || "אין"}`, "");
md.push("| | שכבות | ישויות |", "|---|---|---|");
md.push(`| אושרו אוטומטית | ${acc.length} | ${pieces(acc)} (${Math.round((100 * pieces(acc)) / total)}%) |`);
md.push(`| נשלחו לבן אדם | ${hum.length} | ${pieces(hum)} (${Math.round((100 * pieces(hum)) / total)}%) |`, "");
md.push(`שכבות עם אמת ידועה: ${rows.filter((r) => r.truth).length}. אושרו אוטומטית: ${accTruth.length}, מהן נכונות: ${accTruth.filter((r) => r.correct).length}. נשלחו לבן אדם: ${humTruth.length}, מהן שההצעה שלהן נכונה: ${humTruth.filter((r) => r.correct).length}.`, "");
md.push("## שכבות עם אמת ידועה", "", "| שכבה | פריטים | הצעה | אמת | נכון | תמיכה | וטו | החלטה |", "|---|---|---|---|---|---|---|---|");
for (const r of rows.filter((x) => x.truth)) md.push(`| ${r.layer} | ${r.pieces} | ${r.kind} | ${r.truth} | ${r.correct ? "✓" : "✗"} | ${r.supports.join(" ") || "—"} | ${r.vetoes.join(" ") || "—"}${r.warn ? " (אזהרה: " + r.warn + ")" : ""} | ${r.accept ? "אושר" : "בן אדם: " + r.why} |`);
const reasons = new Map<string, { n: number; p: number }>();
for (const r of hum) { const e = reasons.get(r.why) ?? { n: 0, p: 0 }; e.n++; e.p += r.pieces; reasons.set(r.why, e); }
md.push("", "## למה שכבות נשלחו לבן אדם", "", "| סיבה | שכבות | ישויות |", "|---|---|---|");
for (const [k, e] of [...reasons.entries()].sort((a, b) => b[1].p - a[1].p)) md.push(`| ${k} | ${e.n} | ${e.p} |`);
md.push("", "## וטו שנתפסו", "");
for (const r of rows.filter((x) => x.vetoes.length)) md.push(`- ${r.layer} (${r.pieces}): ${r.kind} ← ${r.vetoes.join(", ")}${r.truth ? ` [אמת: ${r.truth}; ${r.correct ? "ההצעה נכונה, הוטו שגוי" : "ההצעה שגויה, הוטו צדק"}]` : ""}`);
const suffix = GEO_VETO ? "-geometry-veto" : "";
fs.writeFileSync(path.join(target, `gate-report${suffix}.md`), md.join("\n"));
fs.writeFileSync(path.join(target, `gate${suffix}.json`), JSON.stringify(rows, null, 1));
console.log(md.slice(0, 14).join("\n"));
process.exit(0);
