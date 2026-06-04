/**
 * app/help/loading.tsx
 * Loading skeleton for the Help / FAQ page.
 */
export default function HelpLoading() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col bg-[#0a0c10] text-white"
      aria-busy="true"
      aria-label="טוען מרכז עזרה..."
    >
      {/* Nav */}
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/5" />
        <div className="h-8 w-20 animate-pulse rounded-lg bg-white/5" />
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        {/* Title */}
        <div className="h-9 w-1/2 animate-pulse rounded-xl bg-white/5" />

        {/* Search bar */}
        <div className="h-11 w-full animate-pulse rounded-xl bg-white/5" />

        {/* FAQ sections */}
        {Array.from({ length: 4 }).map((_, section) => (
          <div key={section} className="flex flex-col gap-3" style={{ animationDelay: `${section * 80}ms` }}>
            <div className="h-5 w-1/3 animate-pulse rounded-lg bg-white/5" />
            {Array.from({ length: 3 }).map((_, item) => (
              <div
                key={item}
                className="h-14 w-full animate-pulse rounded-xl border border-white/5 bg-white/[0.03]"
                style={{ animationDelay: `${(section * 3 + item) * 40}ms` }}
              />
            ))}
          </div>
        ))}
      </main>
    </div>
  );
}
