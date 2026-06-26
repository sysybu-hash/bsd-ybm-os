"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const CrmTableWidget = dynamic(
  () => import("@/components/os/widgets/CrmTableWidget"),
  { ssr: false, loading: () => <TabSkeleton /> },
);

function TabSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
      ))}
    </div>
  );
}

export default function CrmTabPage() {
  return <CrmTableWidget />;
}
