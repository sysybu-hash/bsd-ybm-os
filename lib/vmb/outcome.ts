import { z } from "zod";
import { vmbStudioCameraSchema, type VmbStudioCamera } from "@/lib/validation/schemas/vmb-studio";

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
  /** The studio's files (plan M3), where the route makes one: read through /api/vmb/projects/[id]/studio, never linked. */
  studio: z.object({ dataUrl: z.string().url(), sheetUrl: z.string().url().nullable(), sheets: z.record(z.string(), z.string().url()).optional() }).optional(),
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

/** The cameras the client added in the studio; a camera that does not parse is left out. */
export function projectCameras(manifest: unknown): VmbStudioCamera[] {
  const list = asObject(manifest).cameras;
  return Array.isArray(list) ? list.flatMap((c) => {
    const r = vmbStudioCameraSchema.safeParse(c);
    return r.success ? [r.data] : [];
  }) : [];
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
