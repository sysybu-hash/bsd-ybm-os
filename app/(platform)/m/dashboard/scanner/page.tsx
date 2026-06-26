"use client";

import dynamic from "next/dynamic";

const AiScannerWidget = dynamic(
  () => import("@/components/os/widgets/AiScannerWidget"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 p-4">
        <div className="h-40 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" />
        <div className="h-12 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
      </div>
    ),
  },
);

export default function ScannerTabPage() {
  return <AiScannerWidget embeddedInHub />;
}
