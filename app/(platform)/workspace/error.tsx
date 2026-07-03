"use client";

import SegmentError from "@/components/shared/SegmentError";

export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} route="/workspace" title="שגיאה בטעינת מרחב העבודה" backHref="/" />;
}
