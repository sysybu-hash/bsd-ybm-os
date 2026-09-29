#!/usr/bin/env npx tsx
/**
 * What the permit-strip reader makes of the reference building, against the
 * building's truth file (e2e/fixtures/building-truth.json).
 *
 *   npx tsx scripts/dwf-building-bench.mts ["תוכניות בנין/27.10.24-גרמושקה.dwf"]
 *
 * The strip is not in the repo: it carries the engineer's stamp and the
 * applicants' details. Every floor sheet is read into apartments and each
 * apartment's bedrooms, ממ"ד, bathrooms and guest WC are compared with what
 * the sheet names; the script exits non-zero on any difference.
 */
import fs from "node:fs";
import { readDwfFloor } from "@/lib/projects/dwf-floor";
import { geometryFromDwf, sheetGeometry } from "@/lib/projects/floorplan-dwf";
import { levelMarks } from "@/lib/projects/floor-split";
import { splitStrip, unitMarks } from "@/lib/projects/sheet-split";

type TruthApartment = { unit: number; bedrooms: number; mmd: number; bathrooms: number; guestWc?: boolean };
type TruthFloor = { units: number[]; level?: "lower" | "upper"; apartments: TruthApartment[] };
const truth = JSON.parse(fs.readFileSync("e2e/fixtures/building-truth.json", "utf8")) as { floors: TruthFloor[] };

const file = process.argv[2] ?? "תוכניות בנין/27.10.24-גרמושקה.dwf";
const strip = geometryFromDwf(fs.readFileSync(file));
if (!strip) throw new Error(`no drawing read from ${file}`);
const UPM = (72 / 25.4) * 10;

const floors = splitStrip(strip)
  .filter((s) => s.kind === "floor" && s.units.length > 0)
  .map((s) => {
    const sheet = sheetGeometry(strip, s.box);
    const marks = levelMarks(sheet.texts).map((l) => l.value).sort((a, b) => a - b);
    return { units: s.units, sheet, level: marks[marks.length >> 1] ?? 0 };
  });

const WC = /שירותים|שרותים/;
let failed = 0;
for (const want of truth.floors) {
  const same = floors.filter((f) => f.units.join(",") === want.units.join(",")).sort((a, b) => a.level - b.level);
  const got = want.level === "upper" ? same[1] : same[0];
  const label = `[${want.units.join(",")}]${want.level ? ` ${want.level}` : ""}`;
  if (!got) {
    console.log(`${label} MISSING`);
    failed++;
    continue;
  }
  const floor = readDwfFloor(got.sheet, { unitsPerMetre: UPM, units: unitMarks(got.sheet.texts) });
  const line: string[] = [];
  for (const apt of want.apartments) {
    const read = floor.apartments.find((a) => a.unit === apt.unit);
    const rooms = (read?.rooms ?? []).map((id) => floor.rooms.find((r) => r.id === id)!);
    const wc = rooms.filter((r) => r.names.some((n) => WC.test(n)));
    const count = (kind: string) => rooms.filter((r) => r.kind === kind && !wc.includes(r)).length;
    const have = { bedrooms: count("bedroom"), mmd: count("mmd"), bathrooms: count("bathroom"), guestWc: wc.length > 0 };
    const ok =
      have.bedrooms === apt.bedrooms &&
      have.mmd === apt.mmd &&
      have.bathrooms === apt.bathrooms &&
      have.guestWc === (apt.guestWc ?? false);
    if (!ok) failed++;
    line.push(`${apt.unit}${ok ? "" : ` ✗ b${have.bedrooms}/${apt.bedrooms} m${have.mmd}/${apt.mmd} w${have.bathrooms}/${apt.bathrooms}${have.guestWc ? "+wc" : ""}`}`);
  }
  console.log(label, line.join("  "));
}
const total = truth.floors.reduce((n, f) => n + f.apartments.length, 0);
console.log(failed === 0 ? `all ${total} match` : `${failed} of ${total} differ`);
process.exit(failed === 0 ? 0 : 1);
