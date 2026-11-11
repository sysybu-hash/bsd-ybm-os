"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { useVmbBase, vmbPath } from "@/components/vmb/VmbLink";
import { KIND_ICONS } from "@/components/vmb/projects/ProjectCard";

export type NewProjectLabels = {
  title: string;
  name: string;
  namePlaceholder: string;
  kind: string;
  kinds: Record<string, string>;
  create: string;
  cancel: string;
  fail: string;
};

const KINDS = ["building", "house", "flat", "industrial", "public"] as const;

/** Name + building kind, then straight into the new project. */
export function NewProjectDialog({ open, onClose, labels }: { open: boolean; onClose: () => void; labels: NewProjectLabels }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const base = useVmbBase();
  const ids = useId();
  const [kind, setKind] = useState<(typeof KINDS)[number]>("building");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/vmb/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind }),
      });
      const data = (await res.json().catch(() => null)) as { project?: { id: string } } | null;
      if (!res.ok || !data?.project) throw new Error("create failed");
      router.push(vmbPath(base, `/app/p/${data.project.id}`));
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={`${ids}-t`}
      className="vmb-card m-auto w-[min(560px,calc(100vw-32px))] p-0 text-[color:var(--vmb-ink)] backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="p-6">
        <div className="flex items-center justify-between">
          <h2 id={`${ids}-t`} className="vmb-display text-2xl font-extrabold">
            {labels.title}
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[color:var(--vmb-bg-sunk)]" aria-label={labels.cancel}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <label htmlFor={`${ids}-n`} className="mt-6 block text-sm font-semibold">
          {labels.name}
        </label>
        <input
          id={`${ids}-n`}
          name="name"
          required
          maxLength={120}
          autoFocus
          placeholder={labels.namePlaceholder}
          className="mt-2 w-full rounded-xl border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-sunk)] px-4 py-3 text-base outline-none focus:border-[color:var(--vmb-accent)]"
        />

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">{labels.kind}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {KINDS.map((k) => {
              const Icon = KIND_ICONS[k]!;
              const on = kind === k;
              return (
                <label
                  key={k}
                  className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition ${
                    on
                      ? "border-[color:var(--vmb-accent)] bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-ink)]"
                      : "border-[color:var(--vmb-line)] text-[color:var(--vmb-ink-soft)] hover:border-[color:var(--vmb-line-strong)]"
                  }`}
                >
                  <input type="radio" name="kind" value={k} checked={on} onChange={() => setKind(k)} className="sr-only" />
                  <Icon className={`h-5 w-5 ${on ? "text-[color:var(--vmb-accent)]" : ""}`} aria-hidden />
                  {labels.kinds[k]}
                </label>
              );
            })}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-[color:var(--vmb-fail)]/10 px-4 py-3 text-sm text-[color:var(--vmb-fail)]">
            {labels.fail}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-[color:var(--vmb-bg-sunk)]">
            {labels.cancel}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-full bg-[color:var(--vmb-accent)] px-6 py-2.5 text-sm font-bold text-[color:var(--vmb-accent-ink)] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {labels.create}
          </button>
        </div>
      </form>
    </dialog>
  );
}
