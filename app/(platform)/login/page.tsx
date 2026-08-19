import AuthExperience from "@/components/auth/AuthExperience";
import { getEffectiveTierMonthlyPriceIls } from "@/lib/billing-pricing";
import { paypalPurchasableTiers } from "@/lib/subscription-tier-config";
import type { SubscriptionTier } from "@prisma/client";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
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
  const tiers = paypalPurchasableTiers();
  const prices = await Promise.all(
    tiers.map((t) => getEffectiveTierMonthlyPriceIls(t as SubscriptionTier)),
  );
  const tierPrices: Record<string, number> = { FREE: 0 };
  tiers.forEach((t, i) => {
    const v = prices[i];
    if (typeof v === "number") tierPrices[t] = v;
  });

  return (
    <AuthExperience
      initialMode={initialMode}
      prefilledEmail={prefilledEmail}
      plan={plan}
      tierPrices={tierPrices}
    />
  );
}
