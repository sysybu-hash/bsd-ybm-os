import type { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";
import { getAllPosts } from "@/lib/blog/blog-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getCanonicalSiteUrl().replace(/\/$/, "");
  const now = new Date();

  const staticPaths = [
    "/",
    "/login",
    "/register",
    "/about",
    "/contact",
    "/blog",
    "/privacy",
    "/terms",
    "/legal",
    "/integrations/google",
    "/help",
  ];

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "/" || path === "/blog" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/blog" || path === "/register" ? 0.8 : 0.7,
  }));

  const blogEntries: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: "monthly",
    priority: post.featured ? 0.8 : 0.6,
  }));

  return [...staticEntries, ...blogEntries];
}
