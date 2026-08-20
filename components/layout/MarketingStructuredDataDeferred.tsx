"use client";

import dynamic from "next/dynamic";
import DeferUntilIdle from "@/components/layout/DeferUntilIdle";

const MarketingStructuredData = dynamic(
  () => import("@/components/layout/MarketingStructuredData"),
  { ssr: false },
);

/** JSON-LD — אחרי idle כדי לא להגדיל HTML ראשוני בדף נחיתה */
export default function MarketingStructuredDataDeferred() {
  return (
    <DeferUntilIdle timeoutMs={4000}>
      <MarketingStructuredData />
    </DeferUntilIdle>
  );
}
