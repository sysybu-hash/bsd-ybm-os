export default function ProfessionSettingsLoading() {
  return (
    <div dir="rtl" className="flex flex-col gap-4 p-6" aria-busy="true" aria-label="טוען הגדרות...">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-white/10" />
      <div className="h-4 w-64 animate-pulse rounded-lg bg-white/5" />
      <div className="mt-4 flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-white/5" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}
