"use client";

import dynamic from "next/dynamic";

const GoogleDriveWidget = dynamic(
  () => import("@/components/os/widgets/GoogleDriveWidget"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" /> },
);

export default function DrivePage() {
  return <GoogleDriveWidget />;
}
