import type { Metadata } from "next";
import type { AppLocale } from "@/lib/i18n/config";
import {
  getHreflangAlternates,
  getLocalizedSeo,
  getPublicPageSeo,
  type PublicPageId,
} from "@/lib/google-publish/seo-content";

export function getCanonicalSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.bsd-ybm.co.il";
}

function siteBaseUrl(): URL {
  const siteUrl = getCanonicalSiteUrl();
  return new URL(siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl);
}

function verificationBlocks(): Pick<Metadata, "verification" | "other"> {
  const verification: Metadata["verification"] = {};
  const googleVerification =
    process.env.SITE_VERIFICATION_GOOGLE?.trim() ||
    process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const yahooVerification = process.env.SITE_VERIFICATION_YAHOO?.trim();
  const yandexVerification = process.env.SITE_VERIFICATION_YANDEX?.trim();

  if (googleVerification) verification.google = googleVerification;
  if (yahooVerification) verification.yahoo = yahooVerification;
  if (yandexVerification) verification.yandex = yandexVerification;

  const other: Record<string, string> = {};
  const facebookVerification = process.env.SITE_VERIFICATION_FACEBOOK?.trim();
  const pinterestVerification = process.env.SITE_VERIFICATION_PINTEREST?.trim();
  const bingVerification = process.env.SITE_VERIFICATION_BING?.trim();
  const customMetaName = process.env.SITE_VERIFICATION_META_NAME?.trim();
  const customMetaContent = process.env.SITE_VERIFICATION_META_CONTENT?.trim();

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
  return process.env.VERCEL_ENV === "preview"
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
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "BSD-YBM Operating System",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: ["/og-image.png"],
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
