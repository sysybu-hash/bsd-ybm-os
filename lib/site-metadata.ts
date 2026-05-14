import type { Metadata } from "next";

export function getCanonicalSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.bsd-ybm.co.il";
}

export function buildRootMetadata(): Metadata {
  const siteUrl = getCanonicalSiteUrl();
  const base = new URL(siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl);

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
  /** Bing Webmaster Tools — ערך התוכן של מטא־תגית msvalidate.01 */
  const bingVerification = process.env.SITE_VERIFICATION_BING?.trim();
  const customMetaName = process.env.SITE_VERIFICATION_META_NAME?.trim();
  const customMetaContent = process.env.SITE_VERIFICATION_META_CONTENT?.trim();

  if (facebookVerification) other["facebook-domain-verification"] = facebookVerification;
  if (pinterestVerification) other["p:domain_verify"] = pinterestVerification;
  if (bingVerification) other["msvalidate.01"] = bingVerification;
  if (customMetaName && customMetaContent) other[customMetaName] = customMetaContent;

  const robots: Metadata["robots"] =
    process.env.VERCEL_ENV === "preview"
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

  return {
    metadataBase: base,
    applicationName: "BSD-YBM-OS",
    title: {
      default: "BSD-YBM-OS | מערכת תפעול חכמה לעסקים מקצועיים",
      template: "%s | BSD-YBM-OS",
    },
    description:
      "BSD-YBM-OS מחברת לקוחות, מסמכים, חיוב, בקרה תפעולית ו-AI בתוך מערכת עבודה אחת לעסקים מקצועיים בישראל.",
    keywords: [
      "BSD-YBM-OS",
      "BSD-YBM",
      "CRM",
      "ERP",
      "AI",
      "מסמכים חכמים",
      "חיוב וגבייה",
      "תפעול עסקי",
    ],
    authors: [{ name: "BSD-YBM-OS", url: base.href }],
    openGraph: {
      title: "BSD-YBM-OS | מערכת תפעול חכמה לעסקים מקצועיים",
      description:
        "לקוחות, מסמכים, חיוב, בקרה ו-AI במקום אחד. BSD-YBM-OS בנויה לעסקים שרוצים לנהל עבודה מתוך תמונת מצב אחת.",
      url: base.href,
      siteName: "BSD-YBM-OS",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "BSD-YBM Operating System",
        },
      ],
      locale: "he_IL",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "BSD-YBM-OS | מערכת תפעול חכמה לעסקים מקצועיים",
      description:
        "לקוחות, מסמכים, חיוב, בקרה ו-AI במקום אחד לעסקים שרוצים שליטה אמיתית על העבודה.",
      images: ["/og-image.png"],
    },
    manifest: "/manifest.json",
    alternates: {
      canonical: "/",
    },
    robots,
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
    ...(Object.keys(verification).length ? { verification } : {}),
    ...(Object.keys(other).length ? { other } : {}),
  };
}
