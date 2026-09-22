/**
 * Which audit findings mean the still is a different apartment.
 *
 * The auditor reports two kinds of thing and the pipeline treated them alike.
 * A screen on a desk or a second washing machine is a flaw in a correct flat;
 * a bedroom that is not there, or a room grown outside the outline, is a still
 * of some other flat. Both went into the same amber "what to fix" list, and a
 * frame with the second kind was shipped as the least-bad attempt: דירה 14
 * came back with three bedrooms of four, the kitchen where a bedroom is, and a
 * run marked ok.
 *
 * Orientation is left out on purpose. The auditor's "turned 180 degrees" has
 * been wrong on stills that were not turned — it said so of this same frame —
 * and a false structural verdict would fail runs that are right.
 *
 * "room moved" is left out for the same reason, and it was measured. Over
 * three runs of five reference sheets, every placement verdict I put next to
 * its own plan was wrong except the one it was built for: a still is a
 * perspective cutaway whose walls have thickness, so a region's middle lands a
 * few percent inside the neighbour, and on דירה 20 it convicted the same
 * correct still three runs running. It still earns its keep inside the loop —
 * a frame that draws a moved room is told so and redrawn — but it does not
 * carry the verdict that stops a booklet, which belongs to the findings that
 * are counted rather than located: a bedroom that is not there, a terrace the
 * plan does not draw, a footprint that is not this flat's.
 */

const STRUCTURAL: RegExp[] = [
  /^bedrooms \d+, plan has \d+/i,
  /room\(s\) invented outside the plan outline/i,
  /indoor room\(s\) rendered as outdoor paving/i,
  /printed terraces merged into one deck/i,
  /entrance turned into a terrace/i,
  /front door missing/i,
  /terrace\(s\) furnished as indoor rooms/i,
  /terrace\(s\) invented where the plan has no hatch/i,
  /printed terrace\(s\) missing from the still/i,
  /bedroom\(s\) left without a bed/i,
  /footprint does not match the plan outline/i,
  /CAD block massing shipped/i,
];

export function isStructuralAuditFailure(issue: string): boolean {
  return STRUCTURAL.some((pattern) => pattern.test(issue.trim()));
}

export function structuralAuditFailures(issues: readonly string[] | undefined): string[] {
  return (issues ?? []).filter((issue) => isStructuralAuditFailure(issue));
}

type Verdict = { tier: string; hard: string[]; soft: string[]; ok: boolean };

/**
 * The run's confidence, with what the auditor found in the stills it ships.
 *
 * Until now "ok" came from the geometry alone — the walls, the scale, the
 * area — and said nothing about the picture made from them, so a still of the
 * wrong flat went out under a green report. A structural finding on any
 * shipped overview now makes the run not ok, and says which.
 */
export function withStructuralVerdict<C extends Verdict>(
  confidence: C,
  images: ReadonlyArray<{ viewId: string; roomName?: string; auditIssues?: string[] }>,
): C {
  const overviews = images.filter((img) => img.viewId === "overview" && !img.roomName);
  const found = [...new Set(overviews.flatMap((img) => structuralAuditFailures(img.auditIssues)))];
  if (found.length === 0) return confidence;
  return {
    ...confidence,
    ok: false,
    hard: [...confidence.hard, ...found.map((issue) => `ההדמיה לא תואמת את התוכנית: ${issue}`)],
  };
}
