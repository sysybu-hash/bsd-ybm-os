import { z } from "zod";

/**
 * What an uploaded drawing is, as the identify step reads it before anything
 * is produced. The window shows it and asks when it is not sure; the run is
 * then made for the structure and plans the person confirmed.
 */
export const structureKindSchema = z.enum(["apartment", "building", "house", "commercial", "site", "unknown"]);

export const planSheetKindSchema = z.enum(["floor", "elevation", "section", "roof", "site", "other"]);

export const identifiedPlanSchema = z.object({
  /** Stable within one file: "dxf:0", "dwf:3", "pdf:2", "file:A-ground.dwf". */
  id: z.string().min(1).max(200),
  kind: planSheetKindSchema,
  title: z.string().max(200).optional(),
  /** A storey's name or level mark, when the drawing prints one. */
  level: z.string().max(80).optional(),
  widthM: z.number().finite().nonnegative(),
  heightM: z.number().finite().nonnegative(),
  /** Floor the walls close, m², when it was measured. */
  closedM2: z.number().finite().nonnegative().optional(),
  doors: z.number().int().nonnegative().optional(),
  /** Apartment numbers marked on the sheet. */
  units: z.array(z.number().int()).max(400).optional(),
  /** Why this plan cannot be produced; it is shown and cannot be chosen. */
  blocked: z.string().max(300).optional(),
  /** A small JPEG of the plan, data URL. */
  preview: z.string().max(400_000).optional(),
});

export const dwfUnitSchema = z.object({
  unit: z.number().int(),
  level: z.enum(["lower", "upper"]).nullable(),
  levelM: z.number().finite(),
});

export const structureReportSchema = z.object({
  file: z.object({
    kind: z.enum(["pdf", "dxf", "dwg", "dwf", "image", "files"]),
    name: z.string().max(400),
    bytes: z.number().int().nonnegative(),
  }),
  units: z.object({
    metresPerUnit: z.number().finite().positive().nullable(),
    from: z.enum(["header", "doors", "walls", "printed", "unknown"]),
  }),
  structure: structureKindSchema,
  /** False: the window asks for the structure before it goes on. */
  sure: z.boolean(),
  /** Why, in Hebrew, one line each. */
  reasons: z.array(z.string().max(300)).max(20),
  plans: z.array(identifiedPlanSchema).max(60),
  dwfUnits: z.array(dwfUnitSchema).max(400).optional(),
  /** What the drawing holds that nothing reads, in Hebrew. */
  unread: z.array(z.string().max(400)).max(30),
  /** Reasons nothing can be produced from this file at all. */
  blockers: z.array(z.string().max(300)).max(10),
});

export type StructureKind = z.infer<typeof structureKindSchema>;
export type PlanSheetKind = z.infer<typeof planSheetKindSchema>;
export type IdentifiedPlan = z.infer<typeof identifiedPlanSchema>;
export type StructureReport = z.infer<typeof structureReportSchema>;
