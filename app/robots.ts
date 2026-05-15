import type { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  const base = getCanonicalSiteUrl().replace(/\/$/, "");
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (isPreview) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
