import MarketingSiteLayout from "@/components/layout/MarketingSiteLayout";
import MarketingCinematicShell from "@/components/landing/marketing/MarketingCinematicShell";

export const dynamic = "force-static";

export default function MarketingPreviewPage() {
  return (
    <MarketingSiteLayout locale="he">
      <MarketingCinematicShell locale="he" />
    </MarketingSiteLayout>
  );
}
