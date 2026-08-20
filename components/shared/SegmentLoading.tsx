/**
 * Skeleton טעינה אחיד ל-route segments (animate-pulse, ללא JS).
 * עוטפים אותו ב-loading.tsx מקומי של כל segment.
 */
export default function SegmentLoading() {
  return (
    <div className="space-y-4 p-4">
      <div className="h-32 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
      </div>
      <div className="h-16 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
      <div className="h-16 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
    </div>
  );
}
