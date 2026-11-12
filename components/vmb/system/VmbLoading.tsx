/** Skeleton for VMB studio pages: top bar, title and a grid of cards. */
export function VmbLoading() {
  return (
    <div className="vmb min-h-screen" data-theme="dark" dir="rtl" lang="he" aria-busy="true">
      <div className="h-14 border-b border-[color:var(--vmb-line)]" />
      <div className="mx-auto max-w-[1400px] animate-pulse px-4 py-10 motion-reduce:animate-none">
        <div className="h-12 w-56 rounded-xl bg-[color:var(--vmb-line)]" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-[color:var(--vmb-line)]" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="vmb-card h-[208px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
