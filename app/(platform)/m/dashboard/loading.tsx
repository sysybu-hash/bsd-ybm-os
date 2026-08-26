export default function MobileDashLoading() {
  return (
    <div className="space-y-4 p-4">
      <div className="h-32 animate-pulse rounded-2xl bg-[color:var(--border-main)]" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 animate-pulse rounded-xl bg-[color:var(--border-main)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[color:var(--border-main)]" />
      </div>
      <div className="h-16 animate-pulse rounded-xl bg-[color:var(--border-main)]" />
      <div className="h-16 animate-pulse rounded-xl bg-[color:var(--border-main)]" />
      <div className="h-16 animate-pulse rounded-xl bg-[color:var(--border-main)]" />
    </div>
  );
}
