// Scratch (Damesek Eliezer): photograph the dedicated model in Blender's Cycles. Delete when done.
// npx tsx scripts/_damesek/cycles.mts <model dir> <out dir> <shot ids|all> [samples] [scale]
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [dir, out, idsArg = "all", samplesArg = "256", scaleArg = "1"] = process.argv.slice(2);
if (!dir || !out) { console.error("usage: cycles.mts <model dir> <out dir> [ids] [samples] [scale]"); process.exit(2); }
const scale = Number(scaleArg);
type Shot = { id: string; position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fovDeg: number; w?: number; h?: number; exposure?: number; samples?: number };
const P = (x: number, y: number, z: number) => ({ x, y, z });
const SHOTS: Shot[] = [
  { id: "perspective-ne", position: P(25, 12, 30), target: P(-8, 8, -2), fovDeg: 40 },
  { id: "perspective-nw", position: P(-42, 12, 30), target: P(-8, 8, -2), fovDeg: 40 },
  { id: "perspective-sw", position: P(-42, 12, -36), target: P(-8, 8, -2), fovDeg: 40 },
  { id: "perspective-se", position: P(25, 12, -36), target: P(-8, 8, -2), fovDeg: 40 },
  { id: "street-east", position: P(22, 1.7, 4), target: P(0, 7, 0), fovDeg: 55, w: 2000, h: 1500 },
  { id: "interior-beit-midrash", position: P(-11.6, 10.3, 1.0), target: P(2.5, 9.4, 1.0), fovDeg: 75, exposure: 0.6 },
  { id: "interior-gallery", position: P(1.5, 9.8, 3.5), target: P(-12, 12.2, -2.0), fovDeg: 75, exposure: 0.6 },
  { id: "interior-toilets-floor2", position: P(-14.8, 9.75, -12.2), target: P(-16.2, 8.8, -9.0), fovDeg: 80, exposure: 0.8 },
];
const ids = idsArg === "all" ? SHOTS.map((s) => s.id) : idsArg.split(",");
const shots = SHOTS.filter((s) => ids.includes(s.id)).map((s) => ({ ...s, w: Math.round((s.w ?? 1600) * scale), h: Math.round((s.h ?? 2000) * scale) }));
mkdirSync(out, { recursive: true });
const job = {
  model: path.resolve(dir, "model.json"),
  out: path.resolve(out),
  textures: path.resolve("מערכת הדמיות/_textures"),
  samples: Number(samplesArg),
  device: process.env.DEVICE ?? "auto",
  sunAzimuthDeg: Number(process.env.SUN_AZ ?? 225),
  sunElevationDeg: Number(process.env.SUN_EL ?? 38),
  lamps: [],
  shots,
};
const jobPath = path.resolve(out, "job.json");
writeFileSync(jobPath, JSON.stringify(job, null, 1));
const bin = process.env.BLENDER_BIN ?? "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe";
const t0 = Date.now();
const r = spawnSync(bin, ["-b", "--factory-startup", "--python", path.resolve("scripts/_damesek/cycles_scene.py"), "--", jobPath], { encoding: "utf8", maxBuffer: 1 << 28 });
const lines = `${r.stdout}\n${r.stderr}`.split("\n").filter((l) => /^(DEVICE|MESH|SHOT)|Error|Traceback|line \d+/.test(l));
console.log(lines.join("\n"));
console.log(`exit ${r.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
