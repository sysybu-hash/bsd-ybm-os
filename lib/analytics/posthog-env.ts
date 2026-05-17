/** מפתח ו-host ל-PostHog — תואם גם אינטגרציית Vercel Marketplace */
export function getPostHogProjectKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ||
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_POSTHOG_TOKEN?.trim() ||
    process.env.POSTHOG_API_KEY?.trim() ||
    undefined
  );
}

export function getPostHogHost(): string {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
    "https://eu.i.posthog.com"
  );
}
