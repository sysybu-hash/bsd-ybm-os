import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { fetchFrankfurterRates } from "@/lib/exchange-rates/frankfurter";
import { groupAiUsage } from "@/lib/ai-usage-store";
import { summarizeSiteAiCosts } from "@/lib/ai-cost-summary";
import { listFloorplanVizRunCostRowsAllOrgs } from "@/lib/projects/floorplan-viz-store";
import { monthRange, summarizeAdminVizCosts } from "@/lib/projects/floorplan-viz-costs";
import { tariffForScope } from "@/lib/projects/floorplan-viz-tariff";

export const dynamic = "force-dynamic";

const log = createLogger("admin-ai-costs");

/**
 * GET ?month=YYYY-MM — the site's whole AI bill for the month, and the
 * visualisations against their tariff. Platform admin only: no customer ever
 * sees a cost, only the price they pay.
 */
export const GET = withOSAdmin(async (req) => {
  try {
    const range = monthRange(new URL(req.url).searchParams.get("month"));
    const [usage, vizRows] = await Promise.all([
      groupAiUsage(range),
      listFloorplanVizRunCostRowsAllOrgs(range),
    ]);
    let rate: { usdToIls: number; date: string } | null = null;
    try {
      const rates = await fetchFrankfurterRates("USD", ["ILS"]);
      const ils = rates.rates.ILS;
      if (typeof ils === "number" && ils > 0) rate = { usdToIls: ils, date: rates.date };
    } catch (err: unknown) {
      // No rate, no shekel figure: the page falls back to dollars and says so.
      log.warn("USD/ILS rate unavailable", { error: err instanceof Error ? err.message : String(err) });
    }
    return NextResponse.json({
      success: true,
      month: range.month,
      rate,
      site: {
        ...summarizeSiteAiCosts(usage.rows, range.from, usage.organizationNames),
        measuredSince: usage.firstEventAt?.toISOString() ?? null,
      },
      viz: summarizeAdminVizCosts(vizRows, range, tariffForScope, rate),
    });
  } catch (error) {
    return apiErrorResponse(error, "admin ai-costs GET");
  }
});
