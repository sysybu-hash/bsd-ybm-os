import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { fetchFrankfurterRates } from "@/lib/exchange-rates/frankfurter";
import { listFloorplanVizRunCostRowsAllOrgs } from "@/lib/projects/floorplan-viz-store";
import { monthRange, summarizeAdminVizCosts } from "@/lib/projects/floorplan-viz-costs";
import { tariffForScope } from "@/lib/projects/floorplan-viz-tariff";

export const dynamic = "force-dynamic";

const log = createLogger("admin-viz-costs");

/**
 * GET ?month=YYYY-MM — what the visualisations cost to make, platform-wide,
 * against the booklet tariff. Platform admin only: customers never see a
 * cost, only the price they pay.
 */
export const GET = withOSAdmin(async (req) => {
  try {
    const range = monthRange(new URL(req.url).searchParams.get("month"));
    const rows = await listFloorplanVizRunCostRowsAllOrgs(range);
    let rate: { usdToIls: number; date: string } | null = null;
    try {
      const rates = await fetchFrankfurterRates("USD", ["ILS"]);
      const ils = rates.rates.ILS;
      if (typeof ils === "number" && ils > 0) rate = { usdToIls: ils, date: rates.date };
    } catch (err: unknown) {
      // No rate, no margin: the page shows dollars and says why.
      log.warn("USD/ILS rate unavailable", { error: err instanceof Error ? err.message : String(err) });
    }
    return NextResponse.json({
      success: true,
      month: range.month,
      ...summarizeAdminVizCosts(rows, range, tariffForScope, rate),
    });
  } catch (error) {
    return apiErrorResponse(error, "admin viz-costs GET");
  }
});
