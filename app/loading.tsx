/**
 * app/loading.tsx
 * Root loading shell — matches marketing cinematic dark theme to avoid flash on /.
 */
export default function RootLoading() {
  return (
    <div
      dir="rtl"
      className="marketing-cinematic fixed inset-0 z-[2000] min-h-dvh bg-[#020617]"
      aria-busy="true"
      aria-label="טוען..."
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.08),_transparent_55%)]" />
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
      </div>
    </div>
  );
}
