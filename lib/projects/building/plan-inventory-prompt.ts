import type { HouseInventory } from "@/lib/projects/building/dxf-house";
import type { HouseTruth } from "@/lib/projects/building/house-truth";
import type { Primitive } from "@/lib/projects/building/model";

/**
 * Drawing inventory glued into the plan-paint prompt so the engine cannot
 * invent counts. Prefer a DXF HouseInventory; HouseTruth counts are a fallback.
 */

const nameOf = (p: { block: string; layer: string; group?: string }) =>
  `${p.block} ${p.layer} ${p.group ?? ""}`.toLowerCase();

function countSanitary(inv: HouseInventory): { toilets: number; sinks: number; washers: number; baths: number } {
  let toilets = 0;
  let sinks = 0;
  let washers = 0;
  let baths = 0;
  for (const p of [...inv.sanitary, ...inv.furniture, ...inv.other]) {
    const n = nameOf(p);
    if (/כביסה|washer|washing|מכונת/.test(n)) washers += 1;
    else if (/אסלה|toilet|wc|אסל/.test(n)) toilets += 1;
    else if (/כיור|sink|lavator/.test(n)) sinks += 1;
    else if (/אמבט|bath|tub/.test(n)) baths += 1;
  }
  return { toilets, sinks, washers, baths };
}

/** One paragraph for the painter: counts from the sheet, never room names as labels to burn in. */
export function planInventoryPromptFromInventory(inv: HouseInventory): string {
  const s = countSanitary(inv);
  const stairs = inv.counts.stairsLines > 0 || inv.stairs.length > 0;
  const lines = [
    "INVENTORY FROM THE DRAWING (authority with the render — do not add or omit):",
    `- doors: ${inv.counts.doors}; windows: ${inv.counts.windows}; parking bays: ${inv.counts.parking}; named rooms on the sheet: ${inv.counts.rooms}.`,
    `- stairs present: ${stairs ? "yes (U-stair as the render draws — outer walls only)" : "no"}.`,
    `- sanitary / appliances counted on the sheet: toilets ${s.toilets}, sinks ${s.sinks}, washing machines ${s.washers}, baths ${s.baths}.`,
    `- lawn ≈ ${Math.round(inv.counts.lawnM2)} m²; trees ${inv.counts.trees}; gates ${inv.counts.gates}.`,
    "- Wet-room vestibules and corridors beside baths: zero stairs — flat pale or grey tile only; never oak tread bands next to a toilet.",
    "- Laundry rooms: washing machine only — never invent a toilet next to the washer.",
    "- No televisions, monitors or screens on desks or walls.",
    "Paint only what the render shows for each of these; never burn room-name text into the picture.",
  ];
  return lines.join("\n");
}

/** Fallback when only HouseTruth counts are available (no per-fixture sanitary split). */
export function planInventoryPromptFromTruth(truth: HouseTruth): string {
  return [
    "INVENTORY FROM THE DRAWING (authority with the render — do not add or omit):",
    `- doors: ${truth.counts.doors}; windows: ${truth.counts.windows}; parking bays: ${truth.counts.parking}; named rooms: ${truth.counts.rooms}.`,
    `- stairs present: ${truth.counts.stairs ? "yes (U-stair as the render draws — outer walls only)" : "no"}; fence: ${truth.counts.fence ? "yes" : "no"}.`,
    `- lawn ≈ ${Math.round(truth.counts.lawnM2)} m²; trees ${truth.counts.trees}; gates ${truth.counts.gates}.`,
    "- Wet-room vestibules and corridors beside baths: zero stairs — flat pale or grey tile only; never oak tread bands next to a toilet.",
    "- Laundry rooms: washing machine only — never invent a toilet next to the washer.",
    "- No televisions, monitors or screens on desks or walls.",
    "Paint only what the render shows; never burn room-name text into the picture.",
  ].join("\n");
}

/** Merge base plan prompt with an inventory paragraph (idempotent if already present). */
export function withPlanInventory(basePrompt: string, inventory: string | undefined | null): string {
  const inv = (inventory ?? "").trim();
  if (!inv) return basePrompt;
  if (/INVENTORY FROM THE DRAWING/i.test(basePrompt)) return basePrompt;
  return `${basePrompt}\n${inv}`;
}

/**
 * Inventory paragraph from a measured storey's primitives (model.json) when the
 * DXF inventory is not loaded in-process — counts fixtures by tag/kind.
 */
export function planInventoryPromptFromPrimitives(primitives: readonly Primitive[], floorId: string): string {
  const id = floorId.startsWith("floor-") ? floorId : `floor-${floorId}`;
  const tagOf = (p: Primitive) => `${p.tag ?? ""} ${"material" in p ? String(p.material) : ""}`.toLowerCase();
  let toilets = 0;
  let sinks = 0;
  let washers = 0;
  let baths = 0;
  let sofas = 0;
  let beds = 0;
  let stairs = 0;
  for (const p of primitives) {
    if (!p.tag?.startsWith(`${id}:`)) continue;
    const n = tagOf(p);
    if (/stair|tread|walk/.test(n)) stairs += 1;
    if (/toilet|cistern|אסלה/.test(n)) toilets += 1;
    if (/sink|basin|כיור/.test(n)) sinks += 1;
    if (/washer|כביסה/.test(n)) washers += 1;
    if (/bath|tub|אמבט/.test(n)) baths += 1;
    if (/sofa|couch/.test(n)) sofas += 1;
    if (/(^|:)bed|:single-bed|twin-bed/.test(n) || /\bbed\b/.test(n)) beds += 1;
  }
  return [
    "INVENTORY FROM THE DRAWING (authority with the render — do not add or omit):",
    `- storey ${id}: stairs pieces ~${stairs}; toilets ${toilets}; sinks ${sinks}; washing machines ${washers}; baths ${baths}; sofas ${sofas}; beds ${beds}.`,
    `- Stairs exist only as the outer-wall U-flight the render draws (~${stairs} tread pieces total on this storey); wet-room vestibules and corridors beside baths: zero stairs — keep flat pale or grey tile only.`,
    `- Washing machines on this storey: ${washers} — each laundry keeps the machine alone; never add a toilet beside a washer.`,
    "- No televisions, monitors or screens on desks or walls.",
    "Paint only what the render shows for each of these; never burn room-name text into the picture.",
  ].join("\n");
}
