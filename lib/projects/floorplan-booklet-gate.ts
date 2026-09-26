import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import { openAuditIssues } from "@/lib/projects/floorplan-viz-review";

/**
 * Whether the booklet's hero can go out, as far as the run already knows.
 *
 * A stored still carries the verdict it was saved with, and the frame has not
 * changed since, so it is not audited again: a second scan of the same frame
 * disagrees with the first often enough that re-asking only adds noise and a
 * paid call. That holds only for a verdict this code wrote, which carries its
 * attribution (auditMeta) and counts hard issues alone. Lists saved before it
 * mixed in soft findings, so those stills are audited now.
 *
 * The chosen version is the person's call, including an attempt the gate
 * rejected: they may have looked and found the auditor wrong. What still
 * counts against it is every finding nobody has marked wrong.
 */
export type BookletHeroCheck =
  | { outcome: "refuse"; code: "viz_still_not_in_run" | "viz_still_not_selected"; message: string }
  | { outcome: "stored"; issues: string[] }
  | { outcome: "audit"; dismissed: string[] };

export function checkBookletHero(
  run: { images: FloorplanVizImage[] } | null | undefined,
  heroId: string | undefined,
): BookletHeroCheck {
  if (!run || !heroId) return { outcome: "audit", dismissed: [] };
  const stored = run.images.find((row) => row.id === heroId);
  if (!stored) {
    return {
      outcome: "refuse",
      code: "viz_still_not_in_run",
      message: "ההדמיה אינה שייכת להרצה הזו",
    };
  }
  if (!stored.selected) {
    return {
      outcome: "refuse",
      code: "viz_still_not_selected",
      message: "ההדמיה שנשלחה לחוברת אינה הגרסה הנבחרת",
    };
  }
  const dismissed = (stored.auditDismissed ?? []).map((row) => row.issue);
  if (!stored.auditStatus || !stored.auditMeta) return { outcome: "audit", dismissed };
  return { outcome: "stored", issues: openAuditIssues(stored.auditIssues, stored.auditDismissed) };
}

/** The hero is trimmed and cropped for print, so its outline is not the plan's. */
const PRINT_CROP_FAILURES = new Set(["footprint does not match the plan outline"]);

/** The hard issues that stop a booklet, less any a person marked wrong. */
export function bookletBlockingIssues(issues: string[], dismissed: string[] = []): string[] {
  const marked = new Set(dismissed);
  return issues.filter((issue) => !PRINT_CROP_FAILURES.has(issue) && !marked.has(issue));
}
