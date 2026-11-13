"use client";

import { VmbErrorView } from "@/components/vmb/system/VmbErrorView";

export default function VmbSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <VmbErrorView error={error} reset={reset} route="/vmb/admin/job" />;
}
