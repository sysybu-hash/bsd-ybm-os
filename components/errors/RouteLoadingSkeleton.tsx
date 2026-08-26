/**
 * Shared loading skeleton for App Router route segments (CLAUDE.md §10).
 * Server component: purely visual, no copy, so it needs no translation and
 * renders identically in every locale.
 */
export default function RouteLoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="flex min-h-screen flex-col gap-5 bg-[color:var(--background-main)] p-6"
      aria-busy="true"
      role="status"
    >
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 animate-pulse rounded-xl bg-[color:var(--border-main)]" />
        <div className="h-6 w-48 animate-pulse rounded-lg bg-[color:var(--border-main)]" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse flex-col gap-2 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="h-4 w-1/2 rounded bg-[color:var(--border-main)]" />
            <div className="h-8 w-3/4 rounded-lg bg-[color:var(--border-main)]" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-4 py-2"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-[color:var(--border-main)]" />
            <div className="h-4 flex-1 rounded bg-[color:var(--border-main)]" />
            <div className="h-4 w-24 rounded bg-[color:var(--border-main)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
