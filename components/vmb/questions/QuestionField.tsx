"use client";

import { Check } from "lucide-react";
import type { AnswerValue, Question } from "@/lib/vmb/questions";

export type QuestionText = { title: string; hint: string; options: Record<string, string> };

const pill = (on: boolean) =>
  `flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
    on ? "border-[color:var(--vmb-accent)] bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]" : "border-[color:var(--vmb-line)] hover:border-[color:var(--vmb-line-strong)]"
  }`;

/** One question: pills for a choice or several, a number box for a measure. */
export function QuestionField({ q, text, value, onChange, unit }: { q: Question; text: QuestionText; value: AnswerValue; onChange: (v: AnswerValue) => void; unit: string }) {
  if (q.type === "number")
    return (
      <label className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={q.min}
          max={q.max}
          step={q.step}
          value={String(value)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="vmb-mono w-24 rounded-xl border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-sunk)] px-3 py-1.5 text-sm"
          dir="ltr"
          aria-label={text.title}
        />
        <span className="text-xs text-[color:var(--vmb-muted)]">{unit}</span>
      </label>
    );
  if (q.type === "multi") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label={text.title}>
        {q.options.map((o) => {
          const on = picked.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              // At least one view stays chosen: a booklet with no pictures is not a booklet.
              onClick={() => onChange(on ? (picked.length > 1 ? picked.filter((x) => x !== o) : picked) : [...picked, o])}
              className={pill(on)}
            >
              {on ? <Check className="h-3 w-3" aria-hidden /> : null}
              {text.options[o] ?? o}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={text.title}>
      {q.options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={pill(value === o)}>
          {text.options[o] ?? o}
        </button>
      ))}
    </div>
  );
}
