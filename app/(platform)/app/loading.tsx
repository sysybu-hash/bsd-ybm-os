import { LoadingAnnouncement } from "@/components/errors/LoadingAnnouncement";

/**
 * app/app/loading.tsx
 * Workspace loading skeleton — shown while workspace layout resolves.
 * Matches the OmniCanvas sidebar+content structure.
 */
export default function WorkspaceLoading() {
  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-[color:var(--background-main)]"
      aria-busy="true"
    >
      <LoadingAnnouncement />
      {/* Sidebar skeleton */}
      <aside className="hidden w-16 shrink-0 flex-col gap-3 border-l border-[color:var(--border-main)] bg-[color:var(--background-main)] p-2 md:flex">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-10 animate-pulse rounded-xl bg-[color:var(--border-main)]"
          />
        ))}
      </aside>

      {/* Main content skeleton */}
      <main className="flex flex-1 flex-col gap-4 p-4">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-[color:var(--border-main)]" />
          <div className="h-8 flex-1 animate-pulse rounded-lg bg-[color:var(--border-main)]" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-[color:var(--border-main)]" />
        </div>

        {/* Widget grid */}
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="mb-3 h-4 w-1/3 rounded bg-[color:var(--surface-soft)]" />
              <div className="h-32 rounded-xl bg-[color:var(--border-main)]" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
