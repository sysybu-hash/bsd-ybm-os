export type CostCurrency = "ILS" | "USD";

export type CostRate = { usdToIls: number; date: string } | null;

/**
 * One amount, in the currency the admin picked.
 *
 * Providers bill in dollars; the business runs in shekels. Shekels need the
 * day's rate, and without one the figure stays in dollars rather than being
 * converted at a rate nobody published.
 */
export function formatMoney(usd: number, currency: CostCurrency, rate: CostRate): string {
  if (currency === "ILS" && rate) {
    const ils = usd * rate.usdToIls;
    return `₪${ils.toLocaleString("he-IL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: ils < 100 ? 2 : 0,
    })}`;
  }
  return `$${usd < 10 ? usd.toFixed(3) : usd.toFixed(2)}`;
}

/** Shekel amounts that are shekels at source — the tariff. */
export function formatIls(ils: number): string {
  return `₪${ils.toLocaleString("he-IL", { maximumFractionDigits: ils < 100 ? 2 : 0 })}`;
}

/** A shekel amount shown in the picked currency. */
export function formatIlsIn(ils: number, currency: CostCurrency, rate: CostRate): string {
  if (currency === "USD" && rate) return formatMoney(ils / rate.usdToIls, "USD", rate);
  return formatIls(ils);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const CURRENCY_KEY = "bsd-admin-cost-currency";

export function readCurrency(): CostCurrency {
  try {
    return window.localStorage.getItem(CURRENCY_KEY) === "USD" ? "USD" : "ILS";
  } catch {
    return "ILS";
  }
}

export function saveCurrency(currency: CostCurrency): void {
  try {
    window.localStorage.setItem(CURRENCY_KEY, currency);
  } catch {
    // A private window: the choice lasts for this visit only.
  }
}
