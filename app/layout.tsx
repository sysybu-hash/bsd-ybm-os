import type { Metadata, Viewport } from "next";
import { Assistant, Heebo } from "next/font/google";
import "./globals.css";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SessionProvider from "@/components/os/system/SessionProvider";
import { CSPostHogProvider } from "@/components/providers/posthog-provider";
import PostHogIdentify from "@/components/providers/posthog-identify";
import { I18nProvider } from "@/components/os/system/I18nProvider";
import { AccessibilitySettingsBootstrap } from "@/components/os/system/AccessibilitySettingsBootstrap";
import { COOKIE_LOCALE, normalizeLocale, isRtlLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/load-messages";
import { skipToMainLabel } from "@/lib/skip-to-main-label";
import { buildLocalizedMetadata } from "@/lib/site-metadata";
import AppToaster from "@/components/os/system/AppToaster";
import { ThemeProvider } from "@/components/theme-provider";
import Script from "next/script";
import StructuredDataScript from "@/components/seo/StructuredDataScript";
import CookieConsentBanner from "@/components/legal/CookieConsentBanner";
import AccessibilityToolbar from "@/components/os/system/AccessibilityToolbar";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-heebo",
});

const assistant = Assistant({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-assistant",
});

export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  const base = buildLocalizedMetadata(locale);
  return {
    ...base,
    title: {
      default: base.title as string,
      template: "%s | BSD-YBM-OS",
    },
    manifest: "/manifest.json",
    formatDetection: { email: false, address: false, telephone: false },
    appleWebApp: { capable: true, statusBarStyle: "default", title: "BSD-YBM-OS" },
    icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  };
}

/** סשן משתמש — חייב להתעדכן בכל בקשה; אחרת RSC עלול להציג משתמש קודם ב-SessionProvider */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /** לא נועלים זום — נגישות ותאימות iOS/Android */
  maximumScale: 5,
  viewportFit: "cover",
  /** מקלדת צפה: התאמת גובה תוכן (Chrome/Android ועוד) */
  interactiveWidget: "resizes-content",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  noStore();
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch (e) {
    console.warn("[layout] getServerSession failed — continuing without session", e);
  }
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  const messages = getMessages(locale);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  const htmlLang = locale;
  const mainSkipLabel = skipToMainLabel(messages, locale);

  return (
    <html
      lang={htmlLang}
      dir={dir}
      className={`${heebo.variable} ${assistant.variable}`}
      suppressHydrationWarning
    >
      <body
        className={`${heebo.className} min-h-screen bg-[color:var(--background-main)] font-sans text-[color:var(--foreground-main)] antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <SessionProvider session={session}>
            <CSPostHogProvider>
            <PostHogIdentify />
            <I18nProvider locale={locale} messages={messages}>
              <a
                href="#site-main"
                className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100000] focus:rounded-xl focus:bg-[#1f2937] focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
              >
                {mainSkipLabel}
              </a>
              {/*
                עטיפת אפקטים ויזואליים (ניגודיות/אפור) — לא על body:
                filter על body יוצר containing block ל-fixed וגורם לדוק הצף "לגלול" עם העמוד.
                id=site-main — יעד לדילוג לתוכן (נגישות) בכל דפי האתר.
              */}
              <div
                id="site-main"
                tabIndex={-1}
                className="app-visual-effects-root min-h-app outline-none focus:outline-none"
              >
                <StructuredDataScript />
                <AccessibilitySettingsBootstrap />
                {children}
                <CookieConsentBanner />
                <AccessibilityToolbar />
                <AppToaster />
                <Script id="pwa-ios" strategy="afterInteractive">
                  {`
                    // iOS PWA support
                    if (window.navigator.standalone === true) {
                      document.body.classList.add('pwa-ios');
                    }
                  `}
                </Script>
                <Script id="register-sw" strategy="afterInteractive">
                  {`
                    if ('serviceWorker' in navigator) {
                      window.addEventListener('load', function() {
                        navigator.serviceWorker.register('/sw.js').then(function(registration) {
                          console.log('ServiceWorker registration successful with scope: ', registration.scope);
                        }, function(err) {
                          console.log('ServiceWorker registration failed: ', err);
                        });
                      });
                    }
                  `}
                </Script>
              </div>
            </I18nProvider>
            </CSPostHogProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
