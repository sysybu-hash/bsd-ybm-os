"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2, MessageSquareText } from "lucide-react";
import { QuestionField, type QuestionText } from "@/components/vmb/questions/QuestionField";
import type { QuestionsState } from "@/lib/vmb/answers-store";
import type { AnswerValue, QuestionId } from "@/lib/vmb/questions";

export type QuestionsLabels = {
  title: string;
  subtitle: string;
  fromFiles: string;
  /** By the `from` of a sheet or inferred answer. */
  sources: Record<string, string>;
  change: string;
  isDefault: string;
  save: string;
  skip: string;
  /** {date} */
  saved: string;
  update: string;
  metres: string;
  failed: string;
  questions: Record<string, QuestionText>;
};

const show = (v: AnswerValue, t: QuestionText, unit: string) => (Array.isArray(v) ? v.map((x) => t.options[x] ?? x).join(", ") : typeof v === "number" ? `${v.toFixed(2)} ${unit}` : (t.options[v] ?? v));

/**
 * The one questions form (rule 13.5): what the files answered is shown, not asked; every other question starts on its
 * default, so "skip" is a real answer. Nothing runs or is charged from here — the next step is the cost.
 */
export function QuestionsForm({ projectId, initial, labels }: { projectId: string; initial: QuestionsState; labels: QuestionsLabels }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [mine, setMine] = useState<Partial<Record<QuestionId, AnswerValue>>>(() =>
    Object.fromEntries(Object.entries(initial.resolved).flatMap(([id, a]) => (a.source === "user" ? [[id, a.value]] : []))),
  );
  const [opened, setOpened] = useState<Set<QuestionId>>(new Set());
  const [busy, setBusy] = useState<"save" | "skip" | null>(null);
  const [failed, setFailed] = useState(false);

  const known = state.questions.filter((q) => q.known && mine[q.id] === undefined && !opened.has(q.id));
  const asked = state.questions.filter((q) => !known.includes(q));

  const submit = async (answers: Partial<Record<QuestionId, AnswerValue>>, kind: "save" | "skip") => {
    setBusy(kind);
    setFailed(false);
    const res = await fetch(`/api/vmb/projects/${projectId}/answers`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as QuestionsState | null;
    setBusy(null);
    if (!res?.ok || !data?.questions) return setFailed(true);
    setState(data);
    if (kind === "skip") setMine({});
    router.refresh();
  };

  const confirmed = state.confirmedAt ? new Date(state.confirmedAt).toLocaleDateString("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <section className="vmb-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]">
          <MessageSquareText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">{labels.title}</h2>
          <p className="mt-0.5 text-xs text-[color:var(--vmb-ink-soft)]">{labels.subtitle}</p>
        </div>
      </div>

      {known.length ? (
        <div className="mt-4 rounded-xl bg-[color:var(--vmb-bg-sunk)] p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--vmb-pass)]">
            <FileCheck2 className="h-3.5 w-3.5" aria-hidden />
            {labels.fromFiles}
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {known.map((q) => {
              const t = labels.questions[q.id]!;
              return (
                <li key={q.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{t.title}:</span>
                  <span className="vmb-mono">{show(q.known!.value, t, labels.metres)}</span>
                  <span className="text-[color:var(--vmb-muted)]">· {labels.sources[q.known!.from ?? ""] ?? ""}</span>
                  <button type="button" onClick={() => setOpened((o) => new Set(o).add(q.id))} className="text-[color:var(--vmb-accent)]">
                    {labels.change}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 space-y-5">
        {asked.map((q) => {
          const t = labels.questions[q.id]!;
          const value = mine[q.id] ?? q.known?.value ?? q.default;
          return (
            <div key={q.id}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-sm font-semibold">{t.title}</h3>
                {mine[q.id] === undefined && !q.known ? <span className="text-[11px] text-[color:var(--vmb-muted)]">· {labels.isDefault}</span> : null}
              </div>
              {t.hint ? <p className="-mt-1 mb-2 text-xs text-[color:var(--vmb-muted)]">{t.hint}</p> : null}
              <QuestionField q={q} text={t} value={value} unit={labels.metres} onChange={(v) => setMine((m) => ({ ...m, [q.id]: v }))} />
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[color:var(--vmb-line)] pt-4">
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void submit(mine, "save")}
          className="flex items-center gap-2 rounded-full bg-[color:var(--vmb-accent)] px-5 py-2 text-sm font-bold text-[color:var(--vmb-accent-ink)] disabled:opacity-60"
        >
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {confirmed ? labels.update : labels.save}
        </button>
        {!confirmed ? (
          <button type="button" disabled={busy != null} onClick={() => void submit({}, "skip")} className="rounded-full border border-[color:var(--vmb-line)] px-5 py-2 text-sm font-semibold disabled:opacity-60">
            {busy === "skip" ? <Loader2 className="inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null} {labels.skip}
          </button>
        ) : null}
        {confirmed ? <span className="text-xs text-[color:var(--vmb-pass)]">{labels.saved.replace("{date}", confirmed)}</span> : null}
        {failed ? <span className="text-xs text-[color:var(--vmb-fail)]">{labels.failed}</span> : null}
      </div>
    </section>
  );
}
