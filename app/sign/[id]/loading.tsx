/**
 * app/sign/[id]/loading.tsx
 * Loading skeleton for the public document-signing page.
 */
export default function SignLoading() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c10] px-4 py-12 text-white"
      aria-busy="true"
      aria-label="טוען מסמך לחתימה..."
    >
      <div className="w-full max-w-lg flex flex-col gap-6">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-10 w-36 animate-pulse rounded-xl bg-white/5" />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-6 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-white/5 shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-5 w-2/3 animate-pulse rounded-lg bg-white/5" />
              <div className="h-4 w-1/3 animate-pulse rounded-lg bg-white/5" />
            </div>
          </div>

          {/* Document preview area */}
          <div className="h-52 w-full animate-pulse rounded-xl bg-white/5" />

          {/* Signature pad placeholder */}
          <div className="flex flex-col gap-2">
            <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
            <div className="h-32 w-full animate-pulse rounded-xl border border-white/10 bg-white/[0.02]" />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <div className="h-11 flex-1 animate-pulse rounded-xl bg-white/5" />
            <div className="h-11 w-28 animate-pulse rounded-xl bg-white/5" />
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-center justify-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded-full bg-white/5" />
          <div className="h-4 w-48 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    </div>
  );
}
