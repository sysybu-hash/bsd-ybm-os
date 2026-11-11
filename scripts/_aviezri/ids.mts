import { readFileSync } from "node:fs";
import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
const dir = process.argv[2]!;
const model = JSON.parse(readFileSync(dir + "/model.json", "utf8")), state = JSON.parse(readFileSync(dir + "/state.json", "utf8"));
const v = dwfBuildingViews({ floors: state.floors, model: { extent: model.extent, primitives: model.primitives } }, undefined, {}, { house: false, public: true });
for (const x of v) console.log(x.id, JSON.stringify(x.payload.camera).slice(0, 200), Object.keys(x.payload).join(","));
