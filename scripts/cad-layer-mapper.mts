#!/usr/bin/env npx tsx
/**
 * Prototype: what would a small LLM make of an architect's DXF layers, against what the system maps today?
 *
 *   npx tsx --conditions=react-server scripts/cad-layer-mapper.mts "<file.dxf>" <out dir> [--no-llm] [--no-vision] [--redo-vision] [--vision-missing] [--runs 3] [--model <id>]
 *
 * 1. Reads the drawing and sets down, per layer, what it holds (entity types, sizes, hatches, blocks, a few texts).
 * 2. Today's answer: the generic profile of cad-layers.ts, and — for Pisga — what the Pisga code actually consumes by layer name, as the ground truth.
 * 3. The text LLM's answer, asked `runs` times over differently ordered batches (stability), the majority taken.
 * 4. A geometry check of every proposal (does the layer's content look like what the kind says?).
 * 5. A picture of every layer (its geometry alone) and, for the layers the text pass left open, a vision pass over those pictures.
 * 6. out/index.html: a gallery to confirm by eye; out/report.md: the numbers.
 * Nothing here feeds the pipeline: it is the measurement of whether the idea earns building.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });

const { readDxfDrawing, flattenDxf, arcPoints } = await import("@/lib/projects/dxf-drawing");
const { GENERIC_CAD_PROFILE, layerKind } = await import("@/lib/projects/building/cad-layers");

const [file, outDir, ...flags] = process.argv.slice(2);
if (!file || !outDir) throw new Error('usage: "<file.dxf>" <out dir> [--no-llm] [--no-vision] [--runs N] [--model <id>]');
fs.mkdirSync(path.join(outDir, "thumbs"), { recursive: true });
const flagVal = (f: string) => (flags.includes(f) ? flags[flags.indexOf(f) + 1] : undefined);
const modelFlag = flagVal("--model");
const RUNS = Number(flagVal("--runs") ?? 3);
const t0 = Date.now();
const say = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const safe = (name: string) => name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) + "-" + [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);

type LayerStat = {
  name: string;
  colour: number;
  frozenOrOff: boolean;
  pieces: number;
  types: Record<string, number>;
  segments: number;
  medianSegment: number | null;
  axisAlignedShare: number | null;
  closedShare: number | null;
  arcShare: number;
  textShare: number;
  dimShare: number;
  blockShare: number;
  solidHatches: number;
  hatchPatterns: string[];
  blocks: string[];
  texts: string[];
  colours: string[];
};

// ---- 1. what each layer holds (and the geometry for the pictures)
const d = readDxfDrawing(fs.readFileSync(file));
if (!d) throw new Error("unreadable DXF");
say(`${path.basename(file)} (${(fs.statSync(file).size / 1e6).toFixed(0)} MB): ${d.layers.size} layers, ${d.blocks.size} blocks`);
const pieces = flattenDxf(d);
say(`pieces: ${pieces.length}`);
const byLayer = new Map<string, typeof pieces>();
for (const p of pieces) (byLayer.get(p.layer) ?? byLayer.set(p.layer, []).get(p.layer)!).push(p);

const statsFile = path.join(outDir, "layer-stats.json");
let stats: LayerStat[];
if (fs.existsSync(statsFile) && JSON.parse(fs.readFileSync(statsFile, "utf8"))[0]?.arcShare !== undefined) {
  stats = JSON.parse(fs.readFileSync(statsFile, "utf8")) as LayerStat[];
} else {
  const top = <K,>(m: Map<K, number>, n: number) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n);
  stats = [];
  for (const name of new Set<string>([...d.layers.keys(), ...byLayer.keys()])) {
    const ps = byLayer.get(name) ?? [];
    const decl = d.layers.get(name);
    const types = new Map<string, number>(), blocks = new Map<string, number>(), pats = new Map<string, number>(), cols = new Map<number, number>();
    const texts = new Set<string>();
    const segs: number[] = [];
    let axis = 0, segN = 0, lines = 0, closed = 0, solid = 0, arcs = 0, textN = 0, dimN = 0, blockN = 0;
    for (const p of ps) {
      types.set(p.type, (types.get(p.type) ?? 0) + 1);
      cols.set(p.colour, (cols.get(p.colour) ?? 0) + 1);
      if (p.path.length || p.insert) { blockN++; const b = p.insert ?? p.path[p.path.length - 1]!; blocks.set(b, (blocks.get(b) ?? 0) + 1); }
      if (p.pattern) pats.set(p.pattern, (pats.get(p.pattern) ?? 0) + 1);
      if (p.solid) solid++;
      if (p.arc || p.circle) arcs++;
      if (p.text) { textN++; if (texts.size < 12) texts.add(p.text.replace(/\s+/g, " ").trim().slice(0, 40)); }
      if (p.dimension || p.type === "DIMENSION") dimN++;
      if (p.pts && p.pts.length >= 2) {
        lines++;
        if (p.closed) closed++;
        for (let i = 1; i < p.pts.length; i++) {
          const dx = p.pts[i]!.x - p.pts[i - 1]!.x, dy = p.pts[i]!.y - p.pts[i - 1]!.y, len = Math.hypot(dx, dy);
          if (len < 1e-6) continue;
          segN++;
          if (segs.length < 4000) segs.push(len);
          if (Math.abs(dx) < len * 0.01 || Math.abs(dy) < len * 0.01) axis++;
        }
      }
    }
    segs.sort((a, b) => a - b);
    const n = ps.length || 1;
    stats.push({
      name, colour: decl?.colour ?? 0, frozenOrOff: Boolean(decl && (decl.off || decl.frozen)), pieces: ps.length,
      types: Object.fromEntries(top(types, 6)), segments: segN,
      medianSegment: segs.length ? Number(segs[Math.floor(segs.length / 2)]!.toFixed(1)) : null,
      axisAlignedShare: segN ? Number((axis / segN).toFixed(2)) : null,
      closedShare: lines ? Number((closed / lines).toFixed(2)) : null,
      arcShare: Number((arcs / n).toFixed(2)), textShare: Number((textN / n).toFixed(2)), dimShare: Number((dimN / n).toFixed(2)), blockShare: Number((blockN / n).toFixed(2)),
      solidHatches: solid, hatchPatterns: top(pats, 3).map(([k]) => k), blocks: top(blocks, 6).map(([k, c]) => `${k}×${c}`),
      texts: [...texts].slice(0, 8), colours: top(cols, 2).map(([k]) => "#" + k.toString(16).padStart(6, "0")),
    });
  }
  stats.sort((x, y) => y.pieces - x.pieces);
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 1));
}
const live = stats.filter((s) => s.pieces > 0);
say(`layers with content: ${live.length} of ${stats.length}; frozen/off: ${stats.filter((s) => s.frozenOrOff).length}`);

// ---- 2. what the system maps today, and the truth where the Pisga code names it
type Truth = { kind: string; why: string };
const PISGA_TRUTH: Array<[RegExp, Truth]> = [
  [/^קיר (בטון|בלוק)/, { kind: "wall", why: "pisga-dxf.ts WALL: the walls' bands" }],
  [/^אדום/, { kind: "wall", why: "booklet-pisga-dxf.ts draws it as a wall (red pen)" }],
  [/^(רהיטים|furniture)/, { kind: "furniture", why: "pisga-dxf.ts: FINE pen + isFurn" }],
  [/^כלים סניטריים/, { kind: "sanitary", why: "pisga-dxf.ts: fixtures" }],
  [/TRESPA/i, { kind: "wall-int", why: "pisga-dxf.ts: the WC stalls' partitions (an xref layer)" }],
  [/^TNUA$/, { kind: "parking", why: "pisga-dxf.ts: the car-park bays' lines" }],
  [/^מבט דק/, { kind: "stairs", why: "pisga-dxf.ts: the emergency stair's 1.2 m treads" }],
  [/^מדרגוט/, { kind: "stairs", why: "pisga-stairs.ts: stair runs by layer" }],
  [/^חלון/, { kind: "window", why: "booklet-pisga-dxf.ts: drawn as windows" }],
  [/^(דלטוט|A-DOR)/, { kind: "door", why: "booklet-pisga-dxf.ts: drawn as doors" }],
  [/^מילוי/, { kind: "paving", why: "pisga-dxf.ts / pisga-surfaces.ts: the ground fill (the car park's asphalt)" }],
  [/^טקסט/, { kind: "text", why: "booklet-pisga-dxf.ts skips it as text" }],
  [/^מידה/, { kind: "dimension", why: "booklet-pisga-dxf.ts skips it as dimensions" }],
];
const isPisga = /פסג|pisga/i.test(file);
const truthOf = (name: string): Truth | null => (isPisga ? PISGA_TRUTH.find(([re]) => re.test(name))?.[1] ?? null : null);
const todayOf = (name: string) => layerKind(GENERIC_CAD_PROFILE, name);
const same = (a: string | null | undefined, truth: string) => (truth === "wall" ? a === "wall-ext" || a === "wall-int" : a === truth);

// ---- 3. the geometry check of a proposal (a heuristic, said so in the report)
function geometryVerdict(kind: string, s: LayerStat): "consistent" | "conflict" | "n/a" {
  const walls = kind === "wall-ext" || kind === "wall-int";
  if (walls) {
    if (s.textShare > 0.5 || s.dimShare > 0.3 || s.arcShare > 0.6) return "conflict";
    return (s.axisAlignedShare ?? 0) >= 0.4 || s.solidHatches > 0 || (s.closedShare ?? 0) >= 0.2 ? "consistent" : "conflict";
  }
  if (kind === "door") return s.arcShare >= 0.1 || s.blockShare >= 0.3 ? "consistent" : "conflict";
  if (kind === "window") return s.arcShare > 0.5 ? "conflict" : (s.axisAlignedShare ?? 0) >= 0.5 || s.blockShare >= 0.3 ? "consistent" : "conflict";
  if (kind === "furniture" || kind === "sanitary") return s.textShare > 0.5 ? "conflict" : s.blockShare >= 0.2 || s.arcShare >= 0.1 || (s.closedShare ?? 0) >= 0.2 ? "consistent" : "conflict";
  if (kind === "text") return s.textShare >= 0.5 ? "consistent" : s.textShare < 0.1 && s.segments > 0 ? "conflict" : "n/a";
  if (kind === "dimension") return s.dimShare >= 0.2 || s.textShare >= 0.2 || s.blocks.some((b) => /tick|dim/i.test(b)) ? "consistent" : "n/a";
  return "n/a";
}

// ---- 4. the pictures: each layer's geometry alone, cropped to where most of it is
const TW = 640, TH = 400;
async function thumb(name: string): Promise<string> {
  const file = path.join(outDir, "thumbs", safe(name) + ".png");
  if (fs.existsSync(file)) return file;
  const ps = byLayer.get(name) ?? [];
  const polys: Array<Array<[number, number]>> = [];
  const dots: Array<[number, number]> = [];
  for (const p of ps) {
    let pts = p.pts ?? null;
    if (!pts && p.arc) pts = arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end);
    if (!pts && p.circle) pts = arcPoints(p.circle.c, p.circle.r, 0, Math.PI * 2);
    if (pts && pts.length >= 2) polys.push(pts.map((q) => [q.x, q.y] as [number, number]));
    else if (p.at) dots.push([p.at.x, p.at.y]);
    else if (p.insert && p.m) dots.push([p.m.e, p.m.f]);
  }
  const verts = [...polys.flatMap((q) => q), ...dots];
  if (!verts.length) { await sharp({ create: { width: TW, height: TH, channels: 3, background: "#fff" } }).png().toFile(file); return file; }
  // A drawing's model space holds many sheets side by side, so the layer's whole extent is a few specks: the picture is the densest window of it (a 3 × 2 block of a 40 × 24 grid over the layer's extent, the 0.5% stray outliers left out), the way a person would zoom to where the layer lives.
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * f)))]!;
  const xs = verts.map((v) => v[0]).sort((a, b) => a - b), ys = verts.map((v) => v[1]).sort((a, b) => a - b);
  const [gx0, gx1, gy0, gy1] = [q(xs, 0.005), q(xs, 0.995), q(ys, 0.005), q(ys, 0.995)];
  const GX = 40, GY = 24, BX = 3, BY = 2;
  const cw = Math.max(gx1 - gx0, 1e-6) / GX, ch = Math.max(gy1 - gy0, 1e-6) / GY;
  const grid = Array.from({ length: GX * GY }, () => 0);
  for (const [a, b] of verts) { if (a < gx0 || a > gx1 || b < gy0 || b > gy1) continue; grid[Math.min(GY - 1, Math.floor((b - gy0) / ch)) * GX + Math.min(GX - 1, Math.floor((a - gx0) / cw))]++; }
  let best = { n: -1, cx: 0, cy: 0 };
  for (let cy = 0; cy + BY <= GY; cy++) for (let cx = 0; cx + BX <= GX; cx++) {
    let n = 0;
    for (let j = 0; j < BY; j++) for (let i = 0; i < BX; i++) n += grid[(cy + j) * GX + cx + i]!;
    if (n > best.n) best = { n, cx, cy };
  }
  const wide = GX <= BX * 1.01;
  let [x0, x1, y0, y1] = wide ? [gx0, gx1, gy0, gy1] : [gx0 + best.cx * cw, gx0 + (best.cx + BX) * cw, gy0 + best.cy * ch, gy0 + (best.cy + BY) * ch];
  const pad = Math.max(x1 - x0, y1 - y0, 1) * 0.02;
  [x0, x1, y0, y1] = [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
  const inWin = (pts: Array<[number, number]>) => pts.some(([a, b]) => a >= x0 && a <= x1 && b >= y0 && b <= y1);
  const k = Math.min(TW / Math.max(x1 - x0, 1e-6), TH / Math.max(y1 - y0, 1e-6));
  const X = (v: number) => ((v - x0) * k).toFixed(1), Y = (v: number) => ((y1 - v) * k).toFixed(1);
  const step = Math.max(1, Math.ceil(polys.length / 7000));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}"><rect width="100%" height="100%" fill="#fff"/>`;
  const visible = polys.filter(inWin);
  const vstep = Math.max(1, Math.ceil(visible.length / 7000));
  void step;
  for (let i = 0; i < visible.length; i += vstep) svg += `<polyline fill="none" stroke="#111" stroke-width="0.9" points="${visible[i]!.map(([a, b]) => `${X(a)},${Y(b)}`).join(" ")}"/>`;
  for (const [a, b] of dots.filter(([a, b]) => a >= x0 && a <= x1 && b >= y0 && b <= y1).slice(0, 4000)) svg += `<circle cx="${X(a)}" cy="${Y(b)}" r="2" fill="#c00"/>`;
  svg += `<text x="6" y="${TH - 6}" font-size="12" fill="#06c">${ps.length} pieces in all · window ${(x1 - x0).toFixed(0)} × ${(y1 - y0).toFixed(0)} units, ${visible.length} lines</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// ---- 5. the text LLM, several times
type Guess = { layer: string; kind: string; confidence: number; reason: string };
const KINDS: Array<[string, string]> = [
  ["wall-ext", "an outer wall of the building (the facade line)"],
  ["wall-int", "a wall or partition inside, or a wall of any kind when exterior vs interior cannot be told"],
  ["door", "doors (leaves, swings, door blocks)"],
  ["window", "windows and glazing"],
  ["stairs", "stairs, steps, ramps"],
  ["furniture", "furniture and loose equipment"],
  ["sanitary", "toilets, basins, showers, kitchen fixtures"],
  ["parking", "parking bays and cars"],
  ["lawn", "grass, lawns"],
  ["planting", "shrubs and planting beds"],
  ["tree", "trees"],
  ["paving", "paving, ground finishes, asphalt, fills of the ground"],
  ["fence", "fences, boundary walls"],
  ["railing", "balustrades and railings"],
  ["plot", "the plot boundary, setback lines"],
  ["gate", "gates"],
  ["bins", "waste bins and enclosures"],
  ["overhead", "things above the cut: canopies, slab edges, projections, hidden lines of the floor above"],
  ["text", "labels, notes, room names, titles"],
  ["dimension", "dimensions, grid, axes, level marks"],
  ["group", "a layer that only holds block groups"],
  ["ignore", "drawing furniture of the sheet: frames, title blocks, viewports, hatches without meaning, construction lines, xrefs not about the building"],
  ["unsure", "cannot tell from this information"],
];
const KIND_IDS = new Set(KINDS.map(([k]) => k));
const HEAD = [
  "You map the layers of an Israeli architect's DXF (plans, elevations and sections of one building; layer names are Hebrew, English, Italian or Hebrew written in Latin letters) onto the parts a 3D-building reader needs.",
  "Kinds (use exactly these ids):",
  ...KINDS.map(([k, dsc]) => `- ${k}: ${dsc}`),
  "Answer with a JSON array, one object per input layer, in the same order: {\"layer\": <exact name>, \"kind\": <id>, \"confidence\": <0..1, how sure you are>, \"reason\": <at most 12 words>}.",
  "Use \"unsure\" rather than guess when the evidence does not settle it. Confidence above 0.8 only when the evidence is unambiguous.",
];
const row = (s: LayerStat) => ({ layer: s.name, colour: s.colours[0], pieces: s.pieces, types: s.types, medianSegment: s.medianSegment, axisAligned: s.axisAlignedShare, closed: s.closedShare, arcShare: s.arcShare, textShare: s.textShare, blockShare: s.blockShare, solidHatches: s.solidHatches, hatchPatterns: s.hatchPatterns, blocks: s.blocks, texts: s.texts });

let usage = { calls: 0, promptTokens: 0, outTokens: 0, model: "" };
const llmFile = path.join(outDir, "llm-runs.json");
let runs: Guess[][] = [];
let visionGuesses: Guess[] = [];
let client: InstanceType<Awaited<typeof import("@google/genai")>["GoogleGenAI"]> | null = null;
let models: string[] = [];
async function ask(parts: Array<Record<string, unknown>>, tag: string): Promise<Guess[]> {
  for (const model of models) {
    try {
      const res = await client!.models.generateContent({ model, contents: [{ role: "user", parts }], config: { responseMimeType: "application/json", temperature: 0 } });
      const u = res.usageMetadata;
      usage = { calls: usage.calls + 1, promptTokens: usage.promptTokens + (u?.promptTokenCount ?? 0), outTokens: usage.outTokens + (u?.candidatesTokenCount ?? 0), model };
      const arr = JSON.parse(res.text ?? "[]") as Guess[];
      return arr.filter((g) => g && typeof g.layer === "string" && KIND_IDS.has(g.kind));
    } catch (err: unknown) {
      say(`${tag} on ${model}: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`);
    }
  }
  return [];
}
const mulberry = (a: number) => () => ((a = (a + 0x6d2b79f5) | 0), (((Math.imul(a ^ (a >>> 15), 1 | a) + 0) >>> 0) / 4294967296));
if (!flags.includes("--no-llm")) {
  if (fs.existsSync(llmFile)) {
    ({ runs, visionGuesses, usage } = JSON.parse(fs.readFileSync(llmFile, "utf8")));
    if (flags.includes("--redo-vision")) {
      visionGuesses = [];
      for (const f of fs.readdirSync(path.join(outDir, "thumbs"))) fs.unlinkSync(path.join(outDir, "thumbs", f));
    }
    say(`LLM answers from cache: ${runs.length} runs, ${visionGuesses.length} vision`);
  } else {
    const { GoogleGenAI } = await import("@google/genai");
    const { getGeminiApiKey } = await import("@/lib/gemini-api-key");
    const { getGeneralModelChain } = await import("@/lib/gemini-model");
    client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    models = modelFlag ? [modelFlag] : getGeneralModelChain();
    const BATCH = 45;
    for (let r = 0; r < RUNS; r++) {
      let order = [...live];
      if (r === 1) order.reverse();
      if (r >= 2) { const rnd = mulberry(1234 + r); order = order.map((s) => [rnd(), s] as const).sort((a, b) => a[0] - b[0]).map(([, s]) => s); }
      const batches: LayerStat[][] = [];
      for (let i = 0; i < order.length; i += BATCH) batches.push(order.slice(i, i + BATCH));
      const out = await Promise.all(batches.map((b, i) => ask([{ text: [...HEAD, "Layers:", JSON.stringify(b.map(row))].join("\n") }], `run ${r + 1} batch ${i + 1}`)));
      runs.push(out.flat());
      say(`text run ${r + 1}: ${runs[r]!.length} answers`);
    }
  }
}
const mode = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]!; };
type Consensus = { kind: string; agreement: number; confidence: number; reason: string; kinds: string[] };
const consensus = new Map<string, Consensus>();
for (const s of live) {
  const gs = runs.map((r) => r.find((g) => g.layer === s.name)).filter((g): g is Guess => Boolean(g));
  if (!gs.length) continue;
  const [kind, n] = mode(gs.map((g) => g.kind));
  const mine = gs.filter((g) => g.kind === kind);
  consensus.set(s.name, { kind, agreement: n / gs.length, confidence: Number((mine.reduce((a, g) => a + g.confidence, 0) / mine.length).toFixed(2)), reason: mine[0]!.reason, kinds: gs.map((g) => g.kind) });
}
const geo = (s: LayerStat) => { const c = consensus.get(s.name); return c ? geometryVerdict(c.kind, s) : ("n/a" as const); };
const needsHuman = (s: LayerStat) => { const c = consensus.get(s.name); return !c || c.kind === "unsure" || c.confidence < 0.7 || c.agreement < 1 || geo(s) === "conflict"; };

// ---- 6. the vision pass over the layers left open
const visionMissing = flags.includes("--vision-missing");
if (!flags.includes("--no-llm") && !flags.includes("--no-vision") && (visionMissing || !visionGuesses.length) && consensus.size) {
  // By default the layers the text pass left open; with --vision-missing every layer that has no picture answer yet (the gate wants an independent look at the confident ones too).
  const have = new Set(visionGuesses.map((g) => g.layer));
  const open = visionMissing ? live.filter((s) => !have.has(s.name)) : live.filter(needsHuman);
  say(`pictures for ${open.length} open layers…`);
  for (const s of live) await thumb(s.name);
  if (!client) {
    const { GoogleGenAI } = await import("@google/genai");
    const { getGeminiApiKey } = await import("@/lib/gemini-api-key");
    const { getGeneralModelChain } = await import("@/lib/gemini-model");
    client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    models = modelFlag ? [modelFlag] : getGeneralModelChain();
  }
  const B = 6;
  const jobs: LayerStat[][] = [];
  for (let i = 0; i < open.length; i += B) jobs.push(open.slice(i, i + B));
  const out = await Promise.all(jobs.map(async (b, i) => {
    const parts: Array<Record<string, unknown>> = [{ text: [...HEAD, "You also see, for each layer in order, a picture of the layer's geometry alone (black lines, red dots for blocks and texts), cropped to where most of it is. Judge by the picture and the numbers together.", "Layers (the picture of layer k follows the list, in order):", JSON.stringify(b.map(row))].join("\n") }];
    for (const s of b) {
      parts.push({ text: `Picture of layer: ${s.name}` });
      parts.push({ inlineData: { mimeType: "image/png", data: fs.readFileSync(await thumb(s.name)).toString("base64") } });
    }
    return ask(parts, `vision batch ${i + 1}`);
  }));
  visionGuesses = [...visionGuesses, ...out.flat()];
  say(`vision: ${visionGuesses.length} answers`);
}
if (!flags.includes("--no-llm") && (!fs.existsSync(llmFile) || flags.includes("--redo-vision") || visionMissing)) fs.writeFileSync(llmFile, JSON.stringify({ runs, visionGuesses, usage }, null, 1));
const vision = new Map(visionGuesses.map((g) => [g.layer, g]));
/** The proposal: the vision answer where the text pass was open and the picture is sure, else the text consensus. */
const proposal = (s: LayerStat): { kind: string; confidence: number; source: "text" | "vision" | "none" } => {
  const c = consensus.get(s.name);
  const v = vision.get(s.name);
  if (v && needsHuman(s) && v.kind !== "unsure" && v.confidence >= 0.75) return { kind: v.kind, confidence: v.confidence, source: "vision" };
  return c ? { kind: c.kind, confidence: c.confidence, source: "text" } : { kind: "—", confidence: 0, source: "none" };
};
const stillOpen = (s: LayerStat) => { const p = proposal(s); return p.kind === "unsure" || p.kind === "—" || p.confidence < 0.7 || (p.source === "text" && needsHuman(s)); };

// ---- 7. the report and the gallery
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const total = live.reduce((a, s) => a + s.pieces, 0);
const piecesOf = (xs: LayerStat[]) => xs.reduce((a, s) => a + s.pieces, 0);
const withTruth = live.filter((s) => truthOf(s.name));
const score = (pick: (s: LayerStat) => string | null | undefined) => withTruth.filter((s) => same(pick(s), truthOf(s.name)!.kind)).length;
const dollars = (usage.promptTokens * 0.75 + usage.outTokens * 3.75) / 1e6;
const md: string[] = [];
md.push(`# מיפוי שכבות: ${path.basename(file)}`, "");
md.push(`שכבות עם תוכן: ${live.length} מתוך ${stats.length} (${total} ישויות). ריצות טקסט: ${runs.length}, תשובות תמונה: ${visionGuesses.length}. קריאות: ${usage.calls}, ${usage.promptTokens} טוקני קלט, ${usage.outTokens} טוקני פלט (${usage.model}), עלות משוערת ${dollars.toFixed(3)}$.`, "");
if (isPisga) {
  md.push("## מול האמת של פסגה", "");
  md.push(`שכבות עם אמת ידועה (מהקוד של פסגה): ${withTruth.length}.`, "");
  md.push("| שיטה | פגיעות |", "|---|---|");
  md.push(`| הפרופיל הכללי של היום | ${score((s) => todayOf(s.name))} |`);
  md.push(`| LLM טקסט, ריצה בודדת (הראשונה) | ${score((s) => runs[0]?.find((g) => g.layer === s.name)?.kind)} |`);
  md.push(`| LLM טקסט, רוב הריצות | ${score((s) => consensus.get(s.name)?.kind)} |`);
  md.push(`| הצעה סופית (טקסט + תמונה) | ${score((s) => proposal(s).kind)} |`, "");
  md.push("| שכבה | פריטים | אמת | היום | טקסט (רוב) | הסכמה | תמונה | הצעה סופית | בדיקת גאומטריה |", "|---|---|---|---|---|---|---|---|---|");
  for (const s of withTruth) {
    const c = consensus.get(s.name), t = truthOf(s.name)!, p = proposal(s);
    md.push(`| ${cell(s.name)} | ${s.pieces} | ${t.kind} | ${cell(todayOf(s.name) ?? "—")} | ${cell(c?.kind ?? "—")} | ${c ? Math.round(c.agreement * 100) + "%" : ""} | ${cell(vision.get(s.name)?.kind ?? "")} | ${cell(p.kind)} ${same(p.kind, t.kind) ? "✓" : "✗"} | ${geo(s)} |`);
  }
  md.push("");
}
md.push("## יציבות", "");
const unstable = live.filter((s) => (consensus.get(s.name)?.agreement ?? 1) < 1);
md.push(`שכבות שבהן הריצות לא הסכימו: ${unstable.length} מתוך ${consensus.size} (${Math.round((100 * piecesOf(unstable)) / total)}% מהישויות).`, "");
for (const s of unstable.slice(0, 25)) md.push(`- ${cell(s.name)} (${s.pieces}): ${consensus.get(s.name)!.kinds.join(" / ")}`);
md.push("", "## בדיקת גאומטריה (היוריסטיקה)", "");
const conflicts = live.filter((s) => geo(s) === "conflict");
md.push(`הצעות שהגאומטריה סותרת: ${conflicts.length}. ${isPisga ? `מתוכן נגד אמת ידועה: ${conflicts.filter((s) => truthOf(s.name) && same(consensus.get(s.name)?.kind, truthOf(s.name)!.kind)).length} (התראות שווא על שכבות נכונות), ${conflicts.filter((s) => truthOf(s.name) && !same(consensus.get(s.name)?.kind, truthOf(s.name)!.kind)).length} (תפסו טעות אמיתית).` : ""}`, "");
for (const s of conflicts.slice(0, 25)) md.push(`- ${cell(s.name)} (${s.pieces}): הוצע ${consensus.get(s.name)!.kind}`);
md.push("", "## כמה נשאר לבן אדם", "");
const human = live.filter(stillOpen);
const confident = live.filter((s) => !stillOpen(s));
md.push("| | שכבות | ישויות |", "|---|---|---|");
md.push(`| הצעה בטוחה (יציבה, ביטחון 0.7 ומעלה, בלי סתירה) | ${confident.length} | ${piecesOf(confident)} (${Math.round((100 * piecesOf(confident)) / total)}%) |`);
md.push(`| נשאר פתוח לאישור אנושי | ${human.length} | ${piecesOf(human)} (${Math.round((100 * piecesOf(human)) / total)}%) |`);
const byKind = new Map<string, { n: number; p: number }>();
for (const s of live) { const k = proposal(s).kind; const e = byKind.get(k) ?? { n: 0, p: 0 }; e.n++; e.p += s.pieces; byKind.set(k, e); }
md.push("", "## פילוג לפי סוג (הצעה סופית)", "", "| סוג | שכבות | ישויות |", "|---|---|---|");
for (const [k, e] of [...byKind.entries()].sort((a, b) => b[1].p - a[1].p)) md.push(`| ${k} | ${e.n} | ${e.p} |`);
md.push("", "## כל השכבות", "", "| שכבה | פריטים | היום | טקסט | הסכמה | תמונה | סופי | גאומטריה | סיבה |", "|---|---|---|---|---|---|---|---|---|");
for (const s of live) { const c = consensus.get(s.name), p = proposal(s); md.push(`| ${cell(s.name)} | ${s.pieces} | ${cell(todayOf(s.name) ?? "—")} | ${cell(c?.kind ?? "—")} ${c?.confidence ?? ""} | ${c ? Math.round(c.agreement * 100) + "%" : ""} | ${cell(vision.get(s.name) ? vision.get(s.name)!.kind + " " + vision.get(s.name)!.confidence : "")} | ${cell(p.kind)} (${p.source}) | ${geo(s)} | ${cell(c?.reason)} |`); }
fs.writeFileSync(path.join(outDir, "report.md"), md.join("\n"));

// the gallery: layers that need a person first, then the rest by size
const ordered = [...human, ...confident];
let html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>מיפוי שכבות</title><style>body{font:14px system-ui,sans-serif;margin:16px;background:#fafafa}h1{font-size:18px}.card{display:grid;grid-template-columns:330px 1fr;gap:12px;background:#fff;border:1px solid #ddd;border-radius:6px;margin:8px 0;padding:8px}.card img{width:320px;border:1px solid #eee}.open{border-color:#e08a00;background:#fff8ec}.k{font-weight:700}.bad{color:#b00}.ok{color:#080}small{color:#666}code{direction:ltr;unicode-bidi:embed}</style><h1>מיפוי שכבות: ${esc(path.basename(file))}</h1><p>${human.length} שכבות פתוחות לאישור (בכתום), אחר כך ${confident.length} שכבות שההצעה בטוחה. התמונה היא הגאומטריה של השכבה לבדה.</p>`;
for (const s of ordered) {
  const c = consensus.get(s.name), p = proposal(s), t = truthOf(s.name), v = vision.get(s.name);
  html += `<div class="card${stillOpen(s) ? " open" : ""}"><img loading="lazy" src="thumbs/${esc(path.basename(await thumb(s.name)))}"><div><div><b><code>${esc(s.name)}</code></b> · ${s.pieces} ישויות · צבע ${esc(s.colours[0])}</div>
<div>הצעה: <span class="k">${esc(p.kind)}</span> (${p.confidence}, ${p.source})${c ? ` · טקסט: ${esc(c.kinds.join(" / "))}` : ""}${v ? ` · תמונה: ${esc(v.kind)} ${v.confidence}` : ""}</div>
<div>היום: ${esc(todayOf(s.name) ?? "לא ממופה")}${t ? ` · אמת: <span class="${same(p.kind, t.kind) ? "ok" : "bad"}">${esc(t.kind)}</span> <small>${esc(t.why)}</small>` : ""} · גאומטריה: ${geo(s)}</div>
<small>${esc(c?.reason ?? "")}${v ? " · תמונה: " + esc(v.reason) : ""}</small>
<div><small>סוגים: ${esc(Object.entries(s.types).map(([k, n]) => `${k}:${n}`).join(" "))} · בלוקים: ${esc(s.blocks.slice(0, 3).join(", "))} · טקסטים: ${esc(s.texts.slice(0, 3).join(" | "))}</small></div></div></div>`;
}
fs.writeFileSync(path.join(outDir, "index.html"), html + "</html>");
say(`report.md and index.html in ${outDir}`);
process.exit(0);
