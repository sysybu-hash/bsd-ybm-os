import { z } from "zod";

/**
 * Who found what on a saved still, and when.
 *
 * The audit's findings used to be saved as one merged list, so a finding could
 * not be traced back: was it Gemini, the Claude second judge, or the room
 * placement check; which model; which wording of the prompt. When two scans of
 * the same frame disagree, that is the question that has to be answered.
 *
 * Kept in its own column, one record per still, replaced whole when the still
 * is scanned again — findings from different scans are never merged.
 */
const auditorSchema = z.object({
  model: z.string().optional(),
  promptVersion: z.string(),
});

export const floorplanVizAuditMetaSchema = z.object({
  v: z.literal(1),
  /** When the scan finished. */
  at: z.string(),
  /** How long the scan took, in milliseconds. */
  ms: z.number().int().min(0),
  /** Gemini's own hard failures, graded without the second judge. */
  gemini: auditorSchema.extend({ hard: z.array(z.string()) }).nullable(),
  /** Hard failures the Claude second judge added on top of Gemini's. */
  claude: auditorSchema.extend({ added: z.array(z.string()) }).nullable(),
  /** Rooms painted where the plan does not put them. */
  placement: z.array(z.string()),
  /** Findings the gate set aside: a double bed or a screen only Claude saw. */
  dropped: z.array(z.string()),
});

export type FloorplanVizAuditMeta = z.infer<typeof floorplanVizAuditMetaSchema>;

/** A stored value read back; anything that does not fit is treated as absent. */
export function parseFloorplanVizAuditMeta(raw: unknown): FloorplanVizAuditMeta | undefined {
  const parsed = floorplanVizAuditMetaSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
