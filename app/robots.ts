import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  const base = getCanonicalSiteUrl().replace(/\/$/, "");
  const isPreview = env.VERCEL_ENV === "preview";
  if (isPreview) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
