export default function LoginLoading() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0a0c10]" aria-busy="true" aria-label="טוען...">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-pulse rounded-2xl bg-white/10" />
        <div className="h-4 w-32 animate-pulse rounded-lg bg-white/10" />
        <div className="h-3 w-24 animate-pulse rounded-lg bg-white/5" />
      </div>
    </div>
  );
}
