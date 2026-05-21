/**
 * app/app/settings/loading.tsx
 * Settings page skeleton.
 */
export default function SettingsLoading() {
  return (
    <div
      dir="rtl"
      className="flex min-h-full flex-col gap-4 p-6"
      aria-busy="true"
      aria-label="טוען הגדרות..."
    >
      {/* Header */}
      <div className="h-7 w-32 animate-pulse rounded-lg bg-white/5" />

      {/* Sections */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] p-5"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="mb-4 h-5 w-40 rounded bg-white/5" />
          <div className="flex flex-col gap-3">
            <div className="h-9 w-full rounded-lg bg-white/5" />
            <div className="h-9 w-3/4 rounded-lg bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
