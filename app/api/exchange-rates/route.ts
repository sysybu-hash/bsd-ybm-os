import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { fetchFrankfurterRates, SUPPORTED_CURRENCIES } from "@/lib/exchange-rates/frankfurter";

export const GET = withWorkspacesAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const base = (searchParams.get("base") ?? "ILS").toUpperCase();
    const symbolsRaw = searchParams.get("symbols") ?? "USD,EUR,GBP,RUB,CHF,CAD,AUD";

    if (!SUPPORTED_CURRENCIES.includes(base as (typeof SUPPORTED_CURRENCIES)[number])) {
      return NextResponse.json({ error: "Unsupported base currency" }, { status: 400 });
    }

    const symbols = symbolsRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .filter((s) => SUPPORTED_CURRENCIES.includes(s as (typeof SUPPORTED_CURRENCIES)[number]));

    const payload = await fetchFrankfurterRates(base, symbols);

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=900" },
    });
  } catch (error) {
    return apiErrorResponse(error, "Exchange rates GET");
  }
});
