import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import { unstable_noStore as noStore } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  isPlatformHost,
  normalizeHostname,
  resolveTenantByHost,
  tenantBrandingCssVars,
} from "@/lib/core/tenant-host";
import { TenantProvider } from "@/components/tenant/TenantContext";
import SessionProvider from "@/components/os/system/SessionProvider";
import { CSPostHogProvider } from "@/components/providers/posthog-provider";
import PostHogIdentifyLazy from "@/components/providers/posthog-identify-lazy";
import { I18nProvider } from "@/components/os/system/I18nProvider";
import { TradeProfileProvider } from "@/components/os/system/TradeProfileProvider";
import { AccessibilitySettingsBootstrap } from "@/components/os/system/AccessibilitySettingsBootstrap";
import { COOKIE_LOCALE, normalizeLocale, isRtlLocale } from "@/lib/i18n/config";
import { getMessages, getMarketingMessages, getWorkspaceMessages } from "@/lib/i18n/load-messages";
import { skipToMainLabel } from "@/lib/skip-to-main-label";
import { buildLocalizedMetadata } from "@/lib/site-metadata";
import { env } from "@/lib/env";
import AppToaster from "@/components/os/system/AppToaster";
import { ThemeProvider } from "@/components/theme-provider";
import Script from "next/script";
import StructuredDataScript from "@/components/seo/StructuredDataScript";
import CookieConsentBanner from "@/components/legal/CookieConsentBanner";
import AccessibilityToolbar from "@/components/os/system/AccessibilityToolbar";
import SiteFeedbackFab from "@/components/feedback/SiteFeedbackFab";
import ConditionalServiceWorker from "@/components/pwa/ConditionalServiceWorker";
import PresenceHeartbeat from "@/components/os/system/PresenceHeartbeat";
import { isMarketingContentPath, isWorkspaceShellPath } from "@/lib/perf/marketing-paths";
import { createLogger } from "@/lib/logger";

const log = createLogger("platform-layout");

const sans = Assistant({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
  variable: "--font-sans",
});

// Static export — avoids Next.js streaming metadata outside <head> for force-dynamic routes.
export const metadata: Metadata = buildLocalizedMetadata("he");

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  noStore();
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch (e) {
    log.warn("getServerSession failed — continuing without session", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "/";
  const lightMarketing = isMarketingContentPath(pathname);
  const messagePack = lightMarketing
    ? ("marketing" as const)
    : isWorkspaceShellPath(pathname)
      ? ("workspace" as const)
      : ("full" as const);
  const messages =
    messagePack === "marketing"
      ? getMarketingMessages(locale)
      : messagePack === "workspace"
        ? getWorkspaceMessages(locale)
        : getMessages(locale);
  const mainSkipLabel = skipToMainLabel(messages, locale);

  const hostHeader = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const host = normalizeHostname(hostHeader);
  let tenant = null;
  try {
    tenant = await resolveTenantByHost(host);
  } catch (e) {
    log.warn("resolveTenantByHost failed — continuing as platform", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  if (host && !isPlatformHost(host) && !tenant) {
    redirect(env.TENANT_FALLBACK_REDIRECT?.trim() || "https://bsd-ybm.co.il");
  }
  const tenantStyle = tenant ? tenantBrandingCssVars(tenant.branding) : undefined;

  return (
    <div
      className={`${sans.variable} ${sans.className} min-h-screen bg-[color:var(--background-main)] font-sans text-[color:var(--foreground-main)] antialiased`}
      dir={dir}
      lang={locale}
      style={tenantStyle}
      data-tenant-id={tenant?.organizationId ?? undefined}
      data-tenant-host={tenant?.host ?? undefined}
    >
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <SessionProvider session={session}>
          <CSPostHogProvider>
            <PostHogIdentifyLazy />
            <I18nProvider locale={locale} messages={messages} pack={messagePack}>
              <TenantProvider tenant={tenant}>
                <TradeProfileProvider>
                  <a
                    href="#site-main"
                    className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100000] focus:rounded-xl focus:bg-[#1f2937] focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
                  >
                    {mainSkipLabel}
                  </a>
                  <div
                    id="site-main"
                    tabIndex={-1}
                    className="app-visual-effects-root min-h-app outline-none focus:outline-none"
                  >
                    <StructuredDataScript />
                    <AccessibilitySettingsBootstrap />
                    {children}
                    <CookieConsentBanner />
                    {!lightMarketing ? <AccessibilityToolbar /> : null}
                    {!lightMarketing ? <SiteFeedbackFab /> : null}
                    <AppToaster />
                    <PresenceHeartbeat />
                    <ConditionalServiceWorker />
                    <Script id="pwa-ios" strategy="afterInteractive">
                      {`if (window.navigator.standalone === true) { document.body.classList.add('pwa-ios'); }`}
                    </Script>
                  </div>
                </TradeProfileProvider>
              </TenantProvider>
            </I18nProvider>
          </CSPostHogProvider>
        </SessionProvider>
      </ThemeProvider>
    </div>
  );
}
