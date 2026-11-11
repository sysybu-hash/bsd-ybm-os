import { readFileSync } from "node:fs";
import path from "node:path";
const { dwfBuildingViews } = await import("@/lib/projects/building/dwf-views");
const dir = process.argv[2]!;
const model = JSON.parse(readFileSync(path.join(dir, "model.json"), "utf8"));
const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
const views = dwfBuildingViews({ floors: state.floors, model: { extent: model.extent, primitives: model.primitives } }, undefined, {}, { house: false, public: true });
for (const v of views) if (v.id.startsWith("elev")) console.log(v.id, JSON.stringify(v.payload.camera), JSON.stringify(Object.keys(v.payload)));
console.log(JSON.stringify(model.extent));
