"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export type OfficeActionsLabels = {
  open: string;
  grant: string;
  amount: string;
  note: string;
  activate: string;
  reference: string;
  extend: string;
  days: string;
  freeze: string;
  unfreeze: string;
  submit: string;
  done: string;
  errors: Record<string, string>;
};

type Body =
  | { action: "grant"; amount: number; note: string }
  | { action: "activate"; reference: string }
  | { action: "extend"; days: number }
  | { action: "freeze" }
  | { action: "unfreeze" };

const field = "w-full rounded-lg border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-sunk)] px-2.5 py-1.5 text-xs";
const btn = "flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--vmb-line-strong)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

/** The hand actions on one office. Each posts once and refreshes the page; the server re-checks the administrator. */
export function OfficeActions({ workspaceId, frozen, labels }: { workspaceId: string; frozen: boolean; labels: OfficeActionsLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (body: Body) => {
    setBusy(body.action);
    setMsg(null);
    const res = await fetch("/api/vmb/admin/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, workspaceId }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(null);
    if (res?.ok) {
      setMsg({ ok: true, text: labels.done });
      router.refresh();
    } else setMsg({ ok: false, text: labels.errors[data?.code ?? "failed"] ?? labels.errors.failed ?? "" });
  };

  const onForm = (e: FormEvent<HTMLFormElement>, make: (f: FormData) => Body) => {
    e.preventDefault();
    void send(make(new FormData(e.currentTarget)));
  };

  const spin = (a: string) => (busy === a ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> : null);

  return (
    <details className="mt-3 rounded-xl border border-[color:var(--vmb-line)] p-3">
      <summary className="cursor-pointer text-xs font-semibold text-[color:var(--vmb-accent)]">{labels.open}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <form method="post" onSubmit={(e) => onForm(e, (f) => ({ action: "grant", amount: Number(f.get("amount")), note: String(f.get("note") ?? "") }))} className="space-y-1.5">
          <p className="text-xs font-bold">{labels.grant}</p>
          <input name="amount" type="number" step={1} required aria-label={labels.amount} placeholder={labels.amount} className={`${field} vmb-mono`} dir="ltr" />
          <input name="note" required minLength={2} maxLength={200} aria-label={labels.note} placeholder={labels.note} className={field} />
          <button type="submit" disabled={busy != null} className={btn}>
            {spin("grant")}
            {labels.submit}
          </button>
        </form>
        <form method="post" onSubmit={(e) => onForm(e, (f) => ({ action: "activate", reference: String(f.get("reference") ?? "") }))} className="space-y-1.5">
          <p className="text-xs font-bold">{labels.activate}</p>
          <input name="reference" required minLength={3} maxLength={80} aria-label={labels.reference} placeholder={labels.reference} className={`${field} vmb-mono`} dir="ltr" />
          <button type="submit" disabled={busy != null} className={btn}>
            {spin("activate")}
            {labels.submit}
          </button>
        </form>
        <div className="space-y-1.5">
          <form method="post" onSubmit={(e) => onForm(e, (f) => ({ action: "extend", days: Number(f.get("days")) }))} className="space-y-1.5">
            <p className="text-xs font-bold">{labels.extend}</p>
            <input name="days" type="number" min={1} max={366} step={1} required aria-label={labels.days} placeholder={labels.days} className={`${field} vmb-mono`} dir="ltr" />
            <button type="submit" disabled={busy != null} className={btn}>
              {spin("extend")}
              {labels.submit}
            </button>
          </form>
          <button type="button" disabled={busy != null} onClick={() => void send({ action: frozen ? "unfreeze" : "freeze" })} className={btn}>
            {spin(frozen ? "unfreeze" : "freeze")}
            {frozen ? labels.unfreeze : labels.freeze}
          </button>
        </div>
      </div>
      {msg ? <p className={`mt-2 text-xs ${msg.ok ? "text-[color:var(--vmb-pass)]" : "text-[color:var(--vmb-fail)]"}`}>{msg.text}</p> : null}
    </details>
  );
}
