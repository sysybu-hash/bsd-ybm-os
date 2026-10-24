/**
 * @jest-environment node
 *
 * The Gottlieb house built from its DWFs (הדמיות גוטליב/gottlieb-dwf, kept out of git and off the site) and counted
 * against what the architect's DWG holds (lib/__fixtures__/house-truth):
 * doors, windows, rooms, stairs, and on the ground floor the parking, the
 * lawn, the trees and the gate. Slow — every storey of three models is stood
 * up — so it runs only with HOUSE_REGRESSION=1. No model is called.
 *
 * A count off by more than its tolerance is a fault. The faults today are
 * the baseline: a change that adds one, or takes one further off, fails
 * here; one that clears one passes and should lower the baseline. Rooms
 * the sheet names in no text, and stairs the model does not stand up, are
 * not compared (house-truth.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildingFromDwf } from "@/lib/projects/building/from-dwf";
import { stackHouseGeometries } from "@/lib/projects/building/house-strip";
import { GOTTLIEB_HOUSE } from "@/lib/projects/building/house-project";
import { compareToTruth, countsFromBuilding, describeFinding, type HouseTruth, type TruthItem } from "@/lib/projects/building/house-truth";
import { forEachDwfFlat, listDwfUnits, readDwfStrip } from "@/lib/projects/dwf-building";

const run = process.env.HOUSE_REGRESSION === "1" ? describe : describe.skip;

const DIR = path.join(process.cwd(), "הדמיות גוטליב", "gottlieb-dwf");
const FIXTURE = JSON.parse(readFileSync(path.join(process.cwd(), "lib", "__fixtures__", "house-truth", "gottlieb.json"), "utf8")) as { sheets: HouseTruth[] };

/**
 * The faults each sheet has today: the model's count of the item. A change
 * may bring it nearer the drawing, not further. None today: every count is
 * within its tolerance.
 */
const BASELINE: Record<string, Partial<Record<TruthItem, number>>> = {};

jest.setTimeout(600_000);

run("the Gottlieb house against its DWG", () => {
  for (const model of GOTTLIEB_HOUSE.models) {
    it(`${model.name}: no count further off its drawing than today`, () => {
      const floors = model.floors.map((f, i) => {
        const g = readDwfStrip(readFileSync(path.join(DIR, f.file)));
        if (!g) throw new Error(`unreadable ${f.file}`);
        return { geometry: g, levelM: GOTTLIEB_HOUSE.levels!.floors[i]! };
      });
      const b = buildingFromDwf(stackHouseGeometries(floors), { name: model.name, finish: "house", north: GOTTLIEB_HOUSE.north });
      const counts = countsFromBuilding(b);
      const lines: string[] = [];
      const added: string[] = [];
      for (const truth of FIXTURE.sheets.filter((s) => s.model === model.id)) {
        const storey = truth.storey as number;
        const mine = counts[storey];
        if (!mine) {
          added.push(`${model.id}${storey}: not stood up`);
          continue;
        }
        const found = compareToTruth(truth, mine.counts);
        const faults = found.filter((f) => f.verdict === "fault");
        lines.push(`${model.id}${storey}: ${found.map((f) => `${f.item} ${f.model}/${f.truth}${f.verdict === "fault" ? "✗" : ""}`).join(", ")}`);
        const today = BASELINE[`${model.id}${storey}`] ?? {};
        const off = (v: number | boolean, t: number | boolean) => (typeof t === "boolean" ? (v === t ? 0 : 1) : Math.abs((v as number) - t));
        const worse = faults.filter((f) => {
          const was = today[f.item];
          return was == null || off(f.model, f.truth) > off(was, f.truth);
        });
        added.push(...worse.map((f) => `${model.id}${storey} ${describeFinding(f)}`));
      }
      console.log(lines.join("\n"));
      expect(added).toEqual([]);
    });

    it(`${model.name}: a kitchen in the house where the drawing names one`, async () => {
      const floors = model.floors.map((f, i) => ({ geometry: readDwfStrip(readFileSync(path.join(DIR, f.file)))!, levelM: GOTTLIEB_HOUSE.levels!.floors[i]! }));
      const strip = stackHouseGeometries(floors);
      const units = listDwfUnits(strip);
      const levels = [...new Set(units.map((u) => u.levelM))].sort((a, b) => a - b);
      const kitchens = new Map<number, number>();
      await forEachDwfFlat(strip, units, async (u, flat) => {
        const storey = levels.indexOf(units.find((w) => w.unit === u.unit && w.level === u.level)!.levelM);
        const n = flat?.rooms.filter((r) => r.kind === "kitchen").length ?? 0;
        kitchens.set(storey, (kitchens.get(storey) ?? 0) + n);
      });
      for (const truth of FIXTURE.sheets.filter((s) => s.model === model.id)) {
        const named = (truth as HouseTruth & { rooms?: Array<{ name: string | null }> }).rooms?.filter((r) => r.name === "מטבח").length ?? 0;
        expect({ storey: truth.storey, kitchens: kitchens.get(truth.storey as number) ?? 0 }).toEqual({ storey: truth.storey, kitchens: named });
      }
    });
  }
});
