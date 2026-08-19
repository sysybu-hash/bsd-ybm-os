import AuthExperience from "@/components/auth/AuthExperience";
import { getEffectiveTierMonthlyPriceIls } from "@/lib/billing-pricing";
import { paypalPurchasableTiers, tierAllowance } from "@/lib/subscription-tier-config";
import type { SubscriptionTier } from "@prisma/client";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Built-in prices, used when the override lookup is unavailable. */
function builtInTierPrices(): Record<string, number> {
  const out: Record<string, number> = { FREE: 0 };
  for (const tier of paypalPurchasableTiers()) {
    const price = tierAllowance(tier).monthlyPriceIls;
    if (typeof price === "number") out[tier] = price;
  }
  return out;
}

/**
 * Effective price per tier, with a hard ceiling on how long the sign-in page
 * will wait for it. A billing-config read must never be able to hang /login.
 */
async function resolveTierPrices(): Promise<Record<string, number>> {
  const tiers = paypalPurchasableTiers();
  try {
    const lookup = Promise.all(
      tiers.map((t) => getEffectiveTierMonthlyPriceIls(t as SubscriptionTier)),
    );
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000));
    const prices = await Promise.race([lookup, timeout]);
    if (!prices) return builtInTierPrices();

    const out: Record<string, number> = { FREE: 0 };
    tiers.forEach((t, i) => {
      const v = prices[i];
      if (typeof v === "number") out[t] = v;
    });
    return out;
  } catch {
    return builtInTierPrices();
  }
}

/**
 * Server component — reads the query params on the server and passes them as
 * props so AuthExperience renders fully SSR (no useSearchParams Suspense bail,
 * which previously left the SSR HTML as a spinner and pushed LCP past 5s).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const initialMode = first(sp.mode) === "register" ? "register" : "login";
  const prefilledEmail = first(sp.email);
  const plan = first(sp.plan) || null;

  // Prices are resolved here rather than in the client, because the effective
  // price can be overridden per tier in OSBillingConfig. Reading the static
  // config on the client would show one number and charge another.
  //
  // This is the sign-in page, so it must render even if that lookup is slow or
  // failing: the query is bounded and any failure falls back to the built-in
  // prices rather than holding up the page. The register wizard hides payment
  // when a price is missing, and the amount charged is always recomputed
  // server-side at order time, so a fallback here can never undercharge.
  const tierPrices = await resolveTierPrices();

  return (
    <AuthExperience
      initialMode={initialMode}
      prefilledEmail={prefilledEmail}
      plan={plan}
      tierPrices={tierPrices}
    />
  );
}
