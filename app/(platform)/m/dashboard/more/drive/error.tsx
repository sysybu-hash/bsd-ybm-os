"use client";

import SegmentError from "@/components/shared/SegmentError";

export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} route="/m/dashboard/more/drive" title="שגיאה בטעינת Drive" backHref="/m/dashboard" />;
}
