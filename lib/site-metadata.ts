import type { Metadata } from "next";
import { PRODUCTION_SITE_URL } from "@/lib/core/site-url";
import { clientEnv, env } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n/config";
import {
  getHreflangAlternates,
  getLocalizedSeo,
  getPublicPageSeo,
  type PublicPageId,
} from "@/lib/google-publish/seo-content";

export function getCanonicalSiteUrl(): string {
  return clientEnv.NEXT_PUBLIC_SITE_URL?.trim() || PRODUCTION_SITE_URL;
}

function siteBaseUrl(): URL {
  const siteUrl = getCanonicalSiteUrl();
  return new URL(siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl);
}

function verificationBlocks(): Pick<Metadata, "verification" | "other"> {
  const verification: Metadata["verification"] = {};
  const googleVerification =
    env.SITE_VERIFICATION_GOOGLE?.trim() || env.GOOGLE_SITE_VERIFICATION?.trim();
  const yahooVerification = env.SITE_VERIFICATION_YAHOO?.trim();
  const yandexVerification = env.SITE_VERIFICATION_YANDEX?.trim();

  if (googleVerification) verification.google = googleVerification;
  if (yahooVerification) verification.yahoo = yahooVerification;
  if (yandexVerification) verification.yandex = yandexVerification;

  const other: Record<string, string> = {};
  const facebookVerification = env.SITE_VERIFICATION_FACEBOOK?.trim();
  const pinterestVerification = env.SITE_VERIFICATION_PINTEREST?.trim();
  const bingVerification = env.SITE_VERIFICATION_BING?.trim();
  const customMetaName = env.SITE_VERIFICATION_META_NAME?.trim();
  const customMetaContent = env.SITE_VERIFICATION_META_CONTENT?.trim();

  if (facebookVerification) other["facebook-domain-verification"] = facebookVerification;
  if (pinterestVerification) other["p:domain_verify"] = pinterestVerification;
  if (bingVerification) other["msvalidate.01"] = bingVerification;
  if (customMetaName && customMetaContent) other[customMetaName] = customMetaContent;

  return {
    ...(Object.keys(verification).length ? { verification } : {}),
    ...(Object.keys(other).length ? { other } : {}),
  };
}

function productionRobots(): Metadata["robots"] {
  return env.VERCEL_ENV === "preview"
    ? { index: false, follow: false, nocache: true }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      };
}

export type LocalizedMetadataOptions = {
  canonicalPath?: string;
  page?: PublicPageId;
};

/** מטא-דאטה לפי locale — דף בית או דף ציבורי (about, privacy, …) */
export function buildLocalizedMetadata(
  locale: AppLocale,
  options: LocalizedMetadataOptions = {},
): Metadata {
  const base = siteBaseUrl();
  const canonicalPath = options.canonicalPath ?? (options.page ? `/${options.page}` : "/");
  const seo = options.page ? getPublicPageSeo(locale, options.page) : getLocalizedSeo(locale);
  const verify = verificationBlocks();

  return {
    metadataBase: base,
    applicationName: "BSD-YBM-OS",
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    authors: [{ name: "BSD-YBM-OS", url: base.href }],
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: new URL(canonicalPath, base).href,
      siteName: "BSD-YBM-OS",
      locale: seo.ogLocale,
      alternateLocale: ["he_IL", "en_US", "ru_RU"].filter((l) => l !== seo.ogLocale),
      images: [
        {
          // Dynamic OG image route — Next.js auto-uses /opengraph-image for root
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: seo.title,
          type: "image/png",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: seo.title,
        },
      ],
    },
    alternates: {
      canonical: canonicalPath,
      languages: getHreflangAlternates(),
    },
    robots: productionRobots(),
    ...verify,
  };
}

export function buildRootMetadata(): Metadata {
  const base = buildLocalizedMetadata("he");
  return {
    ...base,
    title: {
      default: getLocalizedSeo("he").title,
      template: "%s | BSD-YBM-OS",
    },
    manifest: "/manifest.json",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "BSD-YBM-OS",
    },
    icons: {
      icon: "/icon-192.png",
      apple: "/icon-192.png",
    },
  };
}
