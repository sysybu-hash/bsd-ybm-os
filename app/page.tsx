import MarketingSiteLayout from "@/components/layout/MarketingSiteLayout";
import MarketingCinematicShell from "@/components/landing/marketing/MarketingCinematicShell";
import { buildLocalizedMetadata } from "@/lib/site-metadata";

export const dynamic = "force-static";

export const metadata = buildLocalizedMetadata("he", { canonicalPath: "/" });

export default function HomePage() {
  return (
    <MarketingSiteLayout locale="he">
      <MarketingCinematicShell locale="he" />
    </MarketingSiteLayout>
  );
}
