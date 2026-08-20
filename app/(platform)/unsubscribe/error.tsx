"use client";

import SegmentError from "@/components/shared/SegmentError";

export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} route="/unsubscribe" title="שגיאה בטעינת עמוד ההסרה" backHref="/" />;
}
