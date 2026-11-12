"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ProjectStop } from "@/lib/vmb/outcome";

export type StopLabels = {
  title: string;
  /** Said under every stop: nothing was charged. */
  refunded: string;
  /** For a fault the client cannot act on (the engine's message is not shown). */
  fault: string;
  stalled: string;
  pickUnit: string;
  /** {n} */
  unit: string;
  failed: string;
};

/**
 * Why the last run stopped, in the engine's own words when it is something the client can act on, and a plain sentence
 * when it was a fault. A whole-floor drawing offers its flats; picking one clears the stop and the start button is back.
 */
export function StopCard({ projectId, stop, labels }: { projectId: string; stop: ProjectStop; labels: StopLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const text = stop.code === "error" ? labels.fault : stop.code === "stalled" ? labels.stalled : (stop.message ?? labels.fault);

  const pick = async (unit: number) => {
    setBusy(unit);
    setError(false);
    const res = await fetch(`/api/vmb/projects/${projectId}/unit`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unit }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(true);
    router.refresh();
  };

  return (
    <section className="vmb-card p-5" role="status">
      <h2 className="flex items-center gap-2 text-sm font-bold text-[color:var(--vmb-warn)]">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {labels.title}
      </h2>
      <p className="mt-2 text-sm">{text}</p>
      <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">{labels.refunded}</p>
      {stop.code === "unit-needed" && stop.units?.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold">{labels.pickUnit}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stop.units.map((u) => (
              <button
                key={u}
                type="button"
                disabled={busy != null}
                onClick={() => void pick(u)}
                className="flex items-center gap-1.5 rounded-full border border-[color:var(--vmb-line-strong)] px-3 py-1.5 text-xs font-semibold hover:border-[color:var(--vmb-accent)] disabled:opacity-50"
              >
                {busy === u ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {labels.unit.replace("{n}", String(u))}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-[color:var(--vmb-fail)]">{labels.failed}</p> : null}
    </section>
  );
}
