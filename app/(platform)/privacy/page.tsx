import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COOKIE_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import PublicLegalLayout from "@/components/legal/PublicLegalLayout";
import { buildPublicPageMetadata } from "@/lib/google-publish/public-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata("privacy");
}
export default async function PrivacyPage() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  return <PublicLegalLayout kind="privacy" locale={locale} />;
}
