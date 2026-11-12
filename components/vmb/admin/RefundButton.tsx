"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export type RefundLabels = { open: string; note: string; submit: string; confirm: string; errors: Record<string, string> };

/** Marks a payment refunded after the administrator returned the money by hand (PayPal or bank). Asks once to confirm. */
export function RefundButton({ workspaceId, paymentId, labels }: { workspaceId: string; paymentId: string; labels: RefundLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get("note") ?? "");
    if (!window.confirm(labels.confirm)) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vmb/admin/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "refund", workspaceId, paymentId, note }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(false);
    if (res?.ok) {
      setOpen(false);
      router.refresh();
    } else setError(labels.errors[data?.code ?? "failed"] ?? labels.errors.failed ?? "");
  };

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[color:var(--vmb-ink-soft)] underline-offset-2 hover:underline">
        {labels.open}
      </button>
    );
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-center gap-1.5">
      <input name="note" required minLength={2} maxLength={200} placeholder={labels.note} aria-label={labels.note} className="w-40 rounded-lg border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-sunk)] px-2 py-1 text-xs" />
      <button type="submit" disabled={busy} className="flex items-center gap-1 rounded-full border border-[color:var(--vmb-line-strong)] px-3 py-1 text-xs font-semibold disabled:opacity-50">
        {busy ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {labels.submit}
      </button>
      {error ? <span className="text-[color:var(--vmb-fail)]">{error}</span> : null}
    </form>
  );
}
