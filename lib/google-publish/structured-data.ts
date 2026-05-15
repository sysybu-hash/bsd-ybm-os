import { legalSite } from "@/lib/legal-site";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

function parseSameAs(): string[] {
  const raw = process.env.NEXT_PUBLIC_SAME_AS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("http"));
}

export function buildOrganizationJsonLd() {
  const url = getCanonicalSiteUrl().replace(/\/$/, "");
  const sameAs = parseSameAs();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: legalSite.siteName,
    url,
    logo: `${url}/og-image.png`,
    ...(sameAs.length ? { sameAs } : {}),
    email: legalSite.contactEmail,
    address: {
      "@type": "PostalAddress",
      streetAddress: legalSite.registeredAddress,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: legalSite.contactEmail,
      availableLanguage: ["Hebrew", "English", "Russian"],
    },
  };
}

export function buildWebSiteJsonLd() {
  const url = getCanonicalSiteUrl().replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: legalSite.siteName,
    url,
    inLanguage: ["he-IL", "en", "ru"],
    publisher: { "@type": "Organization", name: legalSite.siteName },
  };
}

export function buildSoftwareApplicationJsonLd() {
  const url = getCanonicalSiteUrl().replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "BSD-YBM OS",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "ILS",
      description: "Trial and subscription plans available",
    },
  };
}

export function buildAllStructuredData() {
  return [buildOrganizationJsonLd(), buildWebSiteJsonLd(), buildSoftwareApplicationJsonLd()];
}
