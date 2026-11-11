import { z } from "zod";

/**
 * How a project's last run ended, as the runner left it on the manifest: `booklet` when it delivered, `stop` when it
 * stopped. Pure and zod-checked, so a page never trusts the stored JSON's shape.
 */

const stopSchema = z.object({
  jobId: z.string(),
  code: z.string(),
  message: z.string().nullable(),
  units: z.array(z.number().int()).optional(),
  at: z.string(),
});
export type ProjectStop = z.infer<typeof stopSchema>;

const bookletSchema = z.object({
  url: z.string().url(),
  jobId: z.string(),
  route: z.string().optional(),
  picturesPainted: z.number(),
  picturesFree: z.number(),
  assumptions: z.array(z.string()).default([]),
  unusedAnswers: z.array(z.string()).default([]),
  creditsUsed: z.number(),
  at: z.string(),
});
export type ProjectBooklet = z.infer<typeof bookletSchema>;

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function projectStop(manifest: unknown): ProjectStop | null {
  const r = stopSchema.safeParse(asObject(manifest).stop);
  return r.success ? r.data : null;
}

export function projectBooklet(manifest: unknown): ProjectBooklet | null {
  const r = bookletSchema.safeParse(asObject(manifest).booklet);
  return r.success ? r.data : null;
}

/** The flat chosen on a whole-floor drawing, when one was. */
export function projectUnit(manifest: unknown): number | null {
  const u = asObject(manifest).unit;
  return typeof u === "number" && Number.isInteger(u) ? u : null;
}

/** When the source files were deleted by the office policy (rule 13.11), if they were. */
export function projectFilesDeletedAt(manifest: unknown): string | null {
  const v = asObject(manifest).filesDeletedAt;
  return typeof v === "string" ? v : null;
}
