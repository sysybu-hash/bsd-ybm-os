"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export type RetentionLabels = { title: string; body: string; days: string; never: string; ownerOnly: string; failed: string };

const CHOICES = [7, 30, 90, null] as const;

/** The office's file-deletion policy (rule 13.11): days after a delivered booklet, or never. Only the owner changes it. */
export function RetentionPicker({ initial, canEdit, labels }: { initial: number | null; canEdit: boolean; labels: RetentionLabels }) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const choose = async (days: number | null) => {
    if (!canEdit || days === value) return;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/vmb/account/retention", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(true);
    setValue(days);
    router.refresh();
  };

  return (
    <section className="vmb-card p-7">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        {labels.title}
        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
      </h2>
      <p className="mt-2 text-sm text-[color:var(--vmb-ink-soft)]">{labels.body}</p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={labels.title}>
        {CHOICES.map((d) => (
          <button
            key={String(d)}
            type="button"
            role="radio"
            aria-checked={value === d}
            disabled={!canEdit || busy}
            onClick={() => void choose(d)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold disabled:cursor-not-allowed ${
              value === d
                ? "border-[color:var(--vmb-accent)] bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]"
                : "border-[color:var(--vmb-line)] text-[color:var(--vmb-ink-soft)] disabled:opacity-60"
            }`}
          >
            {d == null ? labels.never : labels.days.replace("{n}", String(d))}
          </button>
        ))}
      </div>
      {!canEdit ? <p className="mt-2 text-xs text-[color:var(--vmb-muted)]">{labels.ownerOnly}</p> : null}
      {error ? <p className="mt-2 text-xs text-[color:var(--vmb-fail)]">{labels.failed}</p> : null}
    </section>
  );
}
