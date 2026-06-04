import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MarketingCinematicShell from "@/components/landing/marketing/MarketingCinematicShell";
import OmniCanvasWorkspaceLoader from "@/components/os/OmniCanvasWorkspaceLoader";
import { COOKIE_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import { buildLocalizedMetadata } from "@/lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  return buildLocalizedMetadata(locale, { canonicalPath: "/" });
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <MarketingCinematicShell />;
  }

  return <OmniCanvasWorkspaceLoader />;
}
