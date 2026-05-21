/**
 * app/loading.tsx
 * Root-level loading skeleton — shown while layout async data resolves.
 * RTL-aware, matches the dark theme of the OS.
 */
export default function RootLoading() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-[#0f172a]"
      aria-busy="true"
      aria-label="טוען..."
    >
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
        <span className="text-sm text-slate-400">טוען...</span>
      </div>
    </div>
  );
}
