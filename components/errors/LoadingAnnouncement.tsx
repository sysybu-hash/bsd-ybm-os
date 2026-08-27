"use client";

import { useI18n } from "@/components/os/system/I18nProvider";

/**
 * Screen-reader announcement for a route's loading state.
 *
 * The `loading.tsx` files used to carry `aria-label="טוען..."` — Hebrew for
 * every locale, on the one piece of text that only assistive technology ever
 * reads.
 *
 * Translating it server-side would mean `getServerTranslator()`, which calls
 * `cookies()` and would opt statically-rendered public routes into dynamic
 * rendering. That is a real cost to pay for a label nobody sees. A one-line
 * client component reads the locale the provider already holds instead, and the
 * surrounding skeleton stays a server component.
 *
 * `useI18n` returns the key when no provider is above it, which is possible for
 * a segment that fails before the tree mounts — hence the explicit fallback.
 */
export function LoadingAnnouncement() {
  const { t } = useI18n();
  const label = t("common.loading");

  return (
    <span className="sr-only" role="status" aria-live="polite">
      {label === "common.loading" ? "Loading…" : label}
    </span>
  );
}
