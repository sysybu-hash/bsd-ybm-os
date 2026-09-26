import { z } from "zod";

/**
 * A person's word against the auditor's, on one finding.
 *
 * The automated audit is wrong often enough to block a correct still for good:
 * on דירה 14 every attempt carries "beds 6, plan has 4" against a sheet the
 * owner confirmed draws six, and "turned 180 degrees" on a still that faces
 * the sheet's way. A finding someone looked at and marked wrong stops counting
 * against the still — for the booklet and for "improve" — and the mark keeps
 * who made it and when, so the override is visible rather than silent.
 *
 * Marks live apart from the scan: a rescan replaces the findings, and a mark
 * still applies to any finding that comes back with the same wording.
 */
const dismissalSchema = z.object({
  issue: z.string().min(1).max(400),
  by: z.string().min(1).max(120),
  at: z.string(),
});

export const floorplanVizDismissalsSchema = z.array(dismissalSchema).max(40);

export type FloorplanVizDismissal = z.infer<typeof dismissalSchema>;

export function parseFloorplanVizDismissals(raw: unknown): FloorplanVizDismissal[] {
  const parsed = floorplanVizDismissalsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** The findings nobody has marked wrong. */
export function openAuditIssues(
  issues: string[] | undefined,
  dismissed: FloorplanVizDismissal[] | undefined,
): string[] {
  const marked = new Set((dismissed ?? []).map((row) => row.issue));
  return (issues ?? []).filter((issue) => issue && !marked.has(issue));
}

/** Mark a finding wrong, or take the mark back. One mark per finding. */
export function setDismissal(
  list: FloorplanVizDismissal[],
  issue: string,
  dismissed: boolean,
  by: string,
  at: string,
): FloorplanVizDismissal[] {
  const rest = list.filter((row) => row.issue !== issue);
  return dismissed ? [...rest, { issue, by, at }] : rest;
}
