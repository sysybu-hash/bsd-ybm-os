export const SUPPORTED_CURRENCIES = [
  "ILS",
  "USD",
  "EUR",
  "GBP",
  "RUB",
  "CHF",
  "CAD",
  "AUD",
  "JPY",
  "CNY",
  "PLN",
  "TRY",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export type ExchangeRatesPayload = {
  base: string;
  date: string;
  rates: Record<string, number>;
  fetchedAt: string;
};

type CacheEntry = {
  expiresAt: number;
  payload: ExchangeRatesPayload;
};

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchFrankfurterRates(base: string, symbols: string[]): Promise<ExchangeRatesPayload> {
  const normalizedBase = base.toUpperCase();
  const symbolList = [...new Set(symbols.map((s) => s.toUpperCase()).filter((s) => s !== normalizedBase))].sort();
  const cacheKey = `${normalizedBase}:${symbolList.join(",")}`;

  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const params = new URLSearchParams({ from: normalizedBase, to: symbolList.join(",") });
  const res = await fetch(`https://api.frankfurter.app/latest?${params.toString()}`, {
    next: { revalidate: 900 },
  });

  if (!res.ok) {
    throw new Error(`Exchange rate provider error: ${res.status}`);
  }

  const data = (await res.json()) as { base: string; date: string; rates: Record<string, number> };
  const payload: ExchangeRatesPayload = {
    base: data.base,
    date: data.date,
    rates: data.rates,
    fetchedAt: new Date().toISOString(),
  };

  memoryCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}
