/**
 * app/app/admin/loading.tsx
 * Loading skeleton for the Platform Admin Console.
 */
export default function AdminLoading() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col bg-[#0a0c10] text-white"
      aria-busy="true"
      aria-label="טוען לוח ניהול..."
    >
      {/* Top bar */}
      <div className="flex items-center gap-4 border-b border-white/5 px-6 py-4">
        <div className="h-7 w-7 animate-pulse rounded-lg bg-white/5" />
        <div className="h-6 w-44 animate-pulse rounded-lg bg-white/5" />
        <div className="flex-1" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-white/5" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar tabs */}
        <aside className="hidden w-48 shrink-0 flex-col gap-2 border-l border-white/5 bg-white/[0.02] p-3 md:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-full animate-pulse rounded-lg bg-white/5"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </aside>

        {/* Main panel */}
        <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] p-4"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="h-4 w-1/2 rounded bg-white/5" />
                <div className="h-8 w-3/4 rounded-lg bg-white/5" />
              </div>
            ))}
          </div>

          {/* Table skeleton */}
          <div className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
            <div className="mb-2 h-5 w-36 animate-pulse rounded-lg bg-white/5" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 animate-pulse py-2"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="h-8 w-8 rounded-full bg-white/5 shrink-0" />
                <div className="h-4 flex-1 rounded bg-white/5" />
                <div className="h-4 w-28 rounded bg-white/5" />
                <div className="h-6 w-16 rounded-full bg-white/5" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
