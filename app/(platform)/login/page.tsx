import AuthExperience from "@/components/auth/AuthExperience";

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

  return (
    <AuthExperience initialMode={initialMode} prefilledEmail={prefilledEmail} plan={plan} />
  );
}
