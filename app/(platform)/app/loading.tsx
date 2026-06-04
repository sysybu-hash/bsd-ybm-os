/**
 * app/app/loading.tsx
 * Workspace loading skeleton — shown while workspace layout resolves.
 * Matches the OmniCanvas sidebar+content structure.
 */
export default function WorkspaceLoading() {
  return (
    <div
      dir="rtl"
      className="flex h-screen w-full overflow-hidden bg-[#0a0c10]"
      aria-busy="true"
      aria-label="טוען סביבת עבודה..."
    >
      {/* Sidebar skeleton */}
      <aside className="hidden w-16 shrink-0 flex-col gap-3 border-l border-white/5 bg-[#0f172a] p-2 md:flex">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-10 animate-pulse rounded-xl bg-white/5"
          />
        ))}
      </aside>

      {/* Main content skeleton */}
      <main className="flex flex-1 flex-col gap-4 p-4">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-white/5" />
          <div className="h-8 flex-1 animate-pulse rounded-lg bg-white/5" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-white/5" />
        </div>

        {/* Widget grid */}
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] p-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="mb-3 h-4 w-1/3 rounded bg-white/5" />
              <div className="h-32 rounded-xl bg-white/5" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
