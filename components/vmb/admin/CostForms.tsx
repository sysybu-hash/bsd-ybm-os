"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Body = Record<string, string | number>;

const field = "w-full rounded-lg border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-sunk)] px-2.5 py-1.5 text-xs";
const btn = "flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--vmb-line-strong)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

/** Posts one cost-console change and refreshes the page; the server re-checks the administrator. */
function useCostAction(failed: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (body: Body) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vmb/admin/costs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setError(failed);
  };
  return { busy, error, send };
}

const Spin = ({ on }: { on: boolean }) => (on ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> : null);

export type RateLabels = { save: string; clear: string; unset: string; failed: string };

/** One rate: its value, or "not entered". */
export function RateField({ rateKey, label, value, labels }: { rateKey: string; label: string; value: number | null; labels: RateLabels }) {
  const { busy, error, send } = useCostAction(labels.failed);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = Number(new FormData(e.currentTarget).get("value"));
    if (Number.isFinite(v) && v >= 0) void send({ action: "rate_set", key: rateKey, value: v });
  };
  return (
    <form method="post" onSubmit={submit} className="space-y-1.5">
      <label className="block text-xs font-bold" htmlFor={`rate-${rateKey}`}>
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={`rate-${rateKey}`}
          name="value"
          type="number"
          min={0}
          step="any"
          required
          defaultValue={value ?? ""}
          placeholder={labels.unset}
          className={`${field} vmb-mono`}
          dir="ltr"
        />
        <button type="submit" disabled={busy} className={btn}>
          <Spin on={busy} />
          {labels.save}
        </button>
        {value != null ? (
          <button type="button" disabled={busy} onClick={() => void send({ action: "rate_clear", key: rateKey })} className={btn}>
            {labels.clear}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-[color:var(--vmb-fail)]">{error}</p> : null}
    </form>
  );
}

export type FixedFormLabels = { vendor: string; amount: string; currency: string; from: string; note: string; add: string; failed: string };

/** Adds a fixed monthly cost. */
export function FixedCostForm({ today, labels }: { today: string; labels: FixedFormLabels }) {
  const { busy, error, send } = useCostAction(labels.failed);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const note = String(f.get("note") ?? "").trim();
    void send({
      action: "fixed_add",
      vendor: String(f.get("vendor") ?? ""),
      amount: Number(f.get("amount")),
      currency: String(f.get("currency") ?? "ILS"),
      startsOn: String(f.get("startsOn") ?? today),
      ...(note ? { note } : {}),
    });
    e.currentTarget.reset();
  };
  return (
    <form method="post" onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto_1fr_2fr_auto] sm:items-end">
      <input name="vendor" required minLength={2} maxLength={80} aria-label={labels.vendor} placeholder={labels.vendor} className={field} />
      <input name="amount" type="number" min={0} step="any" required aria-label={labels.amount} placeholder={labels.amount} className={`${field} vmb-mono`} dir="ltr" />
      <select name="currency" aria-label={labels.currency} defaultValue="ILS" className={field}>
        <option value="ILS">₪</option>
        <option value="USD">$</option>
      </select>
      <input name="startsOn" type="date" required defaultValue={today} aria-label={labels.from} className={`${field} vmb-mono`} dir="ltr" />
      <input name="note" maxLength={200} aria-label={labels.note} placeholder={labels.note} className={field} />
      <button type="submit" disabled={busy} className={btn}>
        <Spin on={busy} />
        {labels.add}
      </button>
      {error ? <p className="text-xs text-[color:var(--vmb-fail)] sm:col-span-6">{error}</p> : null}
    </form>
  );
}

export type FixedRowLabels = { end: string; remove: string; failed: string };

/** Ends a fixed cost from today, or deletes one entered by mistake. */
export function FixedRowActions({ id, today, running, labels }: { id: string; today: string; running: boolean; labels: FixedRowLabels }) {
  const { busy, error, send } = useCostAction(labels.failed);
  return (
    <span className="flex items-center gap-1.5">
      {running ? (
        <button type="button" disabled={busy} onClick={() => void send({ action: "fixed_end", id, endsOn: today })} className={btn}>
          {labels.end}
        </button>
      ) : null}
      <button type="button" disabled={busy} onClick={() => void send({ action: "fixed_delete", id })} className={btn}>
        <Spin on={busy} />
        {labels.remove}
      </button>
      {error ? <span className="text-xs text-[color:var(--vmb-fail)]">{error}</span> : null}
    </span>
  );
}
