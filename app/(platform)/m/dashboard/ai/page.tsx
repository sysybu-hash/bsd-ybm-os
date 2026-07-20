"use client";

import dynamic from "next/dynamic";

const AiChatFullWidget = dynamic(
  () => import("@/components/os/widgets/AiChatFullWidget"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 p-4">
        <div className="h-full min-h-[60vh] animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" />
      </div>
    ),
  },
);

export default function AiTabPage() {
  return <AiChatFullWidget />;
}
