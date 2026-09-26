import { z } from "zod";

import type { FloorplanVizAudit } from "@/lib/projects/floorplan-viz-audit";

/**
 * What a sheet actually draws, settled by a person.
 *
 * The auditor counts every object twice, once in the still and once in the
 * plan, and grades the still against its own reading of the plan. That reading
 * moves between scans: on דירה 14 it has seen three beds, four and six on a
 * sheet that draws five. A manifest is the plan side read once, by eye, and
 * approved. Where it has an approved value the audit's plan reading is
 * replaced by it, and the disagreement is kept as a dispute rather than acted
 * on. A draft value is only shown, never applied.
 */

const bboxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

/** The audit's plan-side counts a manifest item may stand in for. */
export const MANIFEST_AUDIT_FIELDS = [
  "planBedTotal",
  "planBedroomCount",
  "planIslandStoolCount",
  "planKitchenSinkBasins",
  "planWasherCount",
  "planBathtubCount",
  "planSeatingGroupCount",
] as const satisfies ReadonlyArray<keyof FloorplanVizAudit>;

export type ManifestAuditField = (typeof MANIFEST_AUDIT_FIELDS)[number];

const manifestItemSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  /** null where the sheet does not settle it and a person has not either. */
  value: z.number().int().min(0).nullable(),
  status: z.enum(["draft", "approved"]),
  auditField: z.enum(MANIFEST_AUDIT_FIELDS).nullable().optional(),
  bbox: bboxSchema.optional(),
  note: z.string().optional(),
});

export const floorplanManifestSchema = z.object({
  unit: z.string().min(1),
  sheet: z.string().min(1),
  sourceSheet: z.string().optional(),
  draftedAt: z.string(),
  approvedBy: z.string().nullable(),
  items: z.array(manifestItemSchema).min(1),
});

export type FloorplanManifest = z.infer<typeof floorplanManifestSchema>;
export type FloorplanManifestItem = z.infer<typeof manifestItemSchema>;

export type ManifestDispute = {
  itemId: string;
  field: ManifestAuditField;
  /** What the auditor read off the plan this time. */
  auditPlan: number;
  /** What the approved manifest says the plan draws. */
  manifest: number;
};

export function parseFloorplanManifest(raw: unknown): FloorplanManifest {
  const manifest = floorplanManifestSchema.parse(raw);
  const ids = new Set<string>();
  const fields = new Set<string>();
  for (const item of manifest.items) {
    if (ids.has(item.id)) throw new Error(`manifest item ${item.id} appears twice`);
    ids.add(item.id);
    if (item.auditField) {
      if (fields.has(item.auditField)) {
        throw new Error(`manifest maps ${item.auditField} twice`);
      }
      fields.add(item.auditField);
    }
  }
  return manifest;
}

/** Approved items that stand in for an audit field, with a value to stand in with. */
function approvedFieldItems(manifest: FloorplanManifest) {
  return manifest.items.flatMap((item) =>
    item.status === "approved" && item.auditField && item.value != null
      ? [{ id: item.id, field: item.auditField, value: item.value }]
      : [],
  );
}

/**
 * The audit with its plan-side counts replaced by the approved manifest, and
 * the places where the auditor's own plan reading disagreed with it.
 *
 * Only the plan side changes. What the auditor saw in the still is its job and
 * is left alone, so a still with six beds against an approved five still fails
 * — but a still with five no longer fails against a scan that read four.
 */
export function applyPlanManifest(
  audit: FloorplanVizAudit,
  manifest: FloorplanManifest | null | undefined,
): { audit: FloorplanVizAudit; disputes: ManifestDispute[] } {
  if (!manifest) return { audit, disputes: [] };
  const next: FloorplanVizAudit = { ...audit };
  const disputes: ManifestDispute[] = [];
  for (const { id, field, value } of approvedFieldItems(manifest)) {
    const read = audit[field];
    if (read !== value) {
      disputes.push({ itemId: id, field, auditPlan: read, manifest: value });
    }
    next[field] = value;
  }
  return { audit: next, disputes };
}

/** How much of the manifest a person has settled — for the approval page. */
export function manifestProgress(manifest: FloorplanManifest): {
  approved: number;
  total: number;
  unresolved: string[];
} {
  const unresolved = manifest.items
    .filter((item) => item.status !== "approved" || item.value == null)
    .map((item) => item.id);
  return {
    approved: manifest.items.length - unresolved.length,
    total: manifest.items.length,
    unresolved,
  };
}
