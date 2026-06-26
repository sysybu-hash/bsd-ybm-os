"use client";

import dynamic from "next/dynamic";

const DocumentCreatorWidget = dynamic(
  () => import("@/components/os/widgets/DocumentCreatorWidget"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" /> },
);

export default function ErpPage() {
  return <DocumentCreatorWidget embeddedInHub />;
}
