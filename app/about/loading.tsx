/**
 * app/about/loading.tsx
 * Loading skeleton for the About page.
 */
export default function AboutLoading() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col bg-[#0a0c10] text-white"
      aria-busy="true"
      aria-label="טוען..."
    >
      {/* Nav bar skeleton */}
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/5" />
        <div className="h-8 w-20 animate-pulse rounded-lg bg-white/5" />
      </div>

      {/* Hero section */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-4">
          <div className="h-10 w-2/3 animate-pulse rounded-xl bg-white/5" />
          <div className="h-5 w-full animate-pulse rounded-lg bg-white/5" />
          <div className="h-5 w-4/5 animate-pulse rounded-lg bg-white/5" />
        </div>

        {/* Feature list skeleton */}
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="h-4 w-4 rounded-full bg-white/5 shrink-0" />
              <div className="h-4 rounded-lg bg-white/5" style={{ width: `${55 + (i % 3) * 15}%` }} />
            </div>
          ))}
        </div>

        {/* CTA button */}
        <div className="h-11 w-40 animate-pulse rounded-xl bg-white/5" />
      </main>

      {/* Footer */}
      <div className="flex items-center justify-center gap-6 border-t border-white/5 px-6 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-4 w-16 animate-pulse rounded bg-white/5" />
        ))}
      </div>
    </div>
  );
}
