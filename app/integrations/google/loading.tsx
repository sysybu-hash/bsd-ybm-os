export default function GoogleIntegrationLoading() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0a0c10]" aria-busy="true" aria-label="מתחבר ל-Google...">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-pulse rounded-full bg-white/10" />
        <div className="h-4 w-40 animate-pulse rounded-lg bg-white/10" />
      </div>
    </div>
  );
}
