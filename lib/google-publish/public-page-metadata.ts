import { cookies } from "next/headers";
import type { Metadata } from "next";
import { COOKIE_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import { buildLocalizedMetadata } from "@/lib/site-metadata";
import type { PublicPageId } from "@/lib/google-publish/seo-content";

export async function buildPublicPageMetadata(page: PublicPageId): Promise<Metadata> {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  return buildLocalizedMetadata(locale, {
    page,
    canonicalPath: page === "login" ? "/login" : `/${page}`,
  });
}
