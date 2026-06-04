import { clientEnv, env } from "@/lib/env";

/** מפתח ו-host ל-PostHog — תואם גם אינטגרציית Vercel Marketplace */
export function getPostHogProjectKey(): string | undefined {
  return (
    clientEnv.NEXT_PUBLIC_POSTHOG_KEY?.trim() ||
    clientEnv.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
    clientEnv.NEXT_PUBLIC_POSTHOG_TOKEN?.trim() ||
    env.POSTHOG_API_KEY?.trim() ||
    undefined
  );
}

export function getPostHogHost(): string {
  return clientEnv.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://eu.i.posthog.com";
}
