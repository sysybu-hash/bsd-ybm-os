import type { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getCanonicalSiteUrl().replace(/\/$/, "");
  const now = new Date();
  const paths = ["/", "/login", "/about", "/privacy", "/terms", "/legal"];
  return paths.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
