import type { Metadata } from "next";
import { buildLocalizedMetadata } from "@/lib/site-metadata";
import type { PublicPageId } from "@/lib/google-publish/seo-content";

/**
 * Build metadata for public/marketing pages using the default locale (he).
 * Synchronous — avoids Next.js streaming the metadata outside <head>,
 * which would cause Lighthouse / crawlers to miss the description.
 */
export function buildPublicPageMetadata(page: PublicPageId): Metadata {
  return buildLocalizedMetadata("he", {
    page,
    canonicalPath: `/${page}`,
  });
}
