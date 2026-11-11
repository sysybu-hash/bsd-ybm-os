"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Loader2, Play, Undo2 } from "lucide-react";
import { VmbLink } from "@/components/vmb/VmbLink";
import type { RunBlock } from "@/lib/vmb/estimate";
import type { CostState } from "@/lib/vmb/run-store";

export type CostLabels = {
  title: string;
  subtitle: string;
  /** {n} pictures, {c} credits */
  line: string;
  base: string;
  /** {n} */
  expected: string;
  /** {n} */
  cap: string;
  /** {now}, {after} */
  balance: string;
  /** {now}: when the hold cannot be made, or is already made. */
  balanceNow: string;
  /** {n}: the ceiling already held for a queued job. */
  held: string;
  /** {n} */
  start: string;
  blocks: Record<RunBlock, string>;
  /** {n} credits missing */
  missing: string;
  buy: string;
  queued: string;
  cancel: string;
  failed: string;
  views: Record<string, string>;
};

const fill = (t: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t);
const n = (v: number) => v.toLocaleString("en-US");

/**
 * The cost step (rule 13.8): the estimate and its ceiling in credits, the balance before and after the hold, and one
 * button. Whatever stops the button is said in words, with the way past it.
 */
export function CostCard({ projectId, initial, labels }: { projectId: string; initial: CostState; labels: CostLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"start" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { estimate: e, balance, block, queuedJobId } = initial;

  const call = async (method: "POST" | "DELETE") => {
    setBusy(method === "POST" ? "start" : "cancel");
    setError(null);
    const res = await fetch(`/api/vmb/projects/${projectId}/run`, { method }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: RunBlock } | null;
    setBusy(null);
    if (!res?.ok) return setError(data?.code && data.code in labels.blocks ? labels.blocks[data.code] : labels.failed);
    router.refresh();
  };

  return (
    <section className="vmb-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]">
          <Coins className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">{labels.title}</h2>
          <p className="mt-0.5 text-xs text-[color:var(--vmb-ink-soft)]">{labels.subtitle}</p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-[color:var(--vmb-line)] text-xs">
        {e.lines.map((l) => (
          <li key={l.view} className="flex items-baseline justify-between gap-3 py-2">
            <span>{labels.views[l.view] ?? l.view}</span>
            <span className="text-[color:var(--vmb-ink-soft)]">{fill(labels.line, { n: l.pictures, c: l.credits })}</span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 py-2">
          <span>{labels.base}</span>
          <span className="vmb-mono text-[color:var(--vmb-ink-soft)]">{n(e.base)}</span>
        </li>
      </ul>

      <div className="mt-3 rounded-xl bg-[color:var(--vmb-bg-sunk)] p-3">
        <p className="vmb-display text-2xl font-extrabold">{fill(labels.expected, { n: n(e.expected) })}</p>
        <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">{fill(labels.cap, { n: n(e.cap) })}</p>
        <p className="mt-1 text-xs text-[color:var(--vmb-ink-soft)]">
          {queuedJobId
            ? `${fill(labels.balanceNow, { now: n(balance) })} · ${fill(labels.held, { n: n(e.cap) })}`
            : balance >= e.cap
              ? fill(labels.balance, { now: n(balance), after: n(balance - e.cap) })
              : fill(labels.balanceNow, { now: n(balance) })}
        </p>
      </div>

      {queuedJobId ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-[color:var(--vmb-ink-soft)]">{labels.queued}</span>
          <button type="button" disabled={busy != null} onClick={() => void call("DELETE")} className="flex items-center gap-1.5 rounded-full border border-[color:var(--vmb-line)] px-4 py-1.5 text-xs font-semibold disabled:opacity-60">
            {busy === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Undo2 className="h-3.5 w-3.5" aria-hidden />}
            {labels.cancel}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            disabled={block != null || busy != null}
            onClick={() => void call("POST")}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[color:var(--vmb-accent)] px-5 py-2.5 text-sm font-bold text-[color:var(--vmb-accent-ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="h-4 w-4 rtl:rotate-180" aria-hidden />}
            {fill(labels.start, { n: n(e.cap) })}
          </button>
          {block ? (
            <p className="mt-2 text-center text-xs text-[color:var(--vmb-muted)]">
              {block === "insufficient_credits" ? fill(labels.missing, { n: n(e.cap - balance) }) : labels.blocks[block]}
              {block === "insufficient_credits" || block === "no_subscription" ? (
                <>
                  {" "}
                  <VmbLink href="/account" className="font-semibold text-[color:var(--vmb-accent)]">
                    {labels.buy}
                  </VmbLink>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-2 text-center text-xs text-[color:var(--vmb-fail)]">{error}</p> : null}
    </section>
  );
}
