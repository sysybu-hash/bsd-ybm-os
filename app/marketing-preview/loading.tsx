export default function MarketingPreviewLoading() {
  return (
    <div
      dir="rtl"
      className="marketing-cinematic min-h-dvh bg-slate-950"
      aria-busy="true"
      aria-label="טוען תצוגה מקדימה..."
    >
      <div className="h-10 animate-pulse border-b border-amber-500/20 bg-amber-500/10" />
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-24">
        <div className="mx-auto h-12 w-2/3 max-w-xl animate-pulse rounded-2xl bg-white/10" />
        <div className="mx-auto h-6 w-full max-w-2xl animate-pulse rounded-xl bg-white/5" />
        <div className="mx-auto h-14 w-full max-w-2xl animate-pulse rounded-2xl bg-white/10" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
