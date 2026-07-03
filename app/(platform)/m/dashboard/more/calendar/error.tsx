"use client";

import SegmentError from "@/components/shared/SegmentError";

export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} route="/m/dashboard/more/calendar" title="שגיאה בטעינת היומן" backHref="/m/dashboard" />;
}
