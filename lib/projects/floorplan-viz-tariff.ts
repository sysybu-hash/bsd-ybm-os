import type { FloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";

/**
 * What the customer pays for a booklet, in shekels.
 *
 * A booklet with one visualisation is an overview run; a full booklet is one
 * that went on to its interiors, which the run records by moving its scope to
 * "full". There is no payment record per run in the system, so this is the
 * tariff a run is sold at, not a receipt — the admin page says so.
 */
export const FLOORPLAN_VIZ_TARIFF_ILS: Record<FloorplanVizScope, number> = {
  overview: 200,
  full: 300,
  rooms: 300,
};

export function tariffForScope(scope: string | null | undefined): number {
  return scope === "full" || scope === "rooms" ? FLOORPLAN_VIZ_TARIFF_ILS.full : FLOORPLAN_VIZ_TARIFF_ILS.overview;
}
