import MarketingSiteLayout from "@/components/layout/MarketingSiteLayout";
import MarketingCinematicShell from "@/components/landing/marketing/MarketingCinematicShell";

/** Preview of the existing landing with the top nav swapped for a side drawer. */
export default function NavPreviewPage() {
  return (
    <MarketingSiteLayout locale="he">
      <MarketingCinematicShell locale="he" navVariant="drawer" />
    </MarketingSiteLayout>
  );
}
