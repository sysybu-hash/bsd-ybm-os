import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";

/**
 * Whether the booklet's hero can go out, as far as the run already knows.
 *
 * A stored still carries the verdict it was saved with, and the frame has not
 * changed since, so it is not audited again: a second scan of the same frame
 * disagrees with the first often enough that re-asking only adds noise and a
 * paid call. A still the run does not know about has to be audited.
 */
export type BookletHeroCheck =
  | { outcome: "refuse"; code: "viz_still_not_in_run" | "viz_still_not_selected"; message: string }
  | { outcome: "stored"; issues: string[] }
  | { outcome: "audit" };

export function checkBookletHero(
  run: { images: FloorplanVizImage[] } | null | undefined,
  heroId: string | undefined,
): BookletHeroCheck {
  if (!run || !heroId) return { outcome: "audit" };
  const stored = run.images.find((row) => row.id === heroId);
  if (!stored) {
    return {
      outcome: "refuse",
      code: "viz_still_not_in_run",
      message: "ההדמיה אינה שייכת להרצה הזו",
    };
  }
  if (!stored.selected || stored.auditStatus === "rejected") {
    return {
      outcome: "refuse",
      code: "viz_still_not_selected",
      message: "ההדמיה שנבחרה לחוברת נדחתה בבקרת איכות או אינה הגרסה הנבחרת",
    };
  }
  // A still saved before verdicts were stored has none; it is audited now.
  if (!stored.auditStatus) return { outcome: "audit" };
  return { outcome: "stored", issues: stored.auditIssues ?? [] };
}

/** The hero is trimmed and cropped for print, so its outline is not the plan's. */
const PRINT_CROP_FAILURES = new Set(["footprint does not match the plan outline"]);

/** The hard issues that stop a booklet — soft findings never reach this list. */
export function bookletBlockingIssues(issues: string[]): string[] {
  return issues.filter((issue) => !PRINT_CROP_FAILURES.has(issue));
}
