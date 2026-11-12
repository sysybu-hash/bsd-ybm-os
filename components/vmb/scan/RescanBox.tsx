"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { RescanPreview } from "@/lib/vmb/rescan";
import type { ScanView } from "@/lib/vmb/scan-view";

export type RescanLabels = {
  loading: string;
  /** {n} */
  found: string;
  /** {n} */
  deeper: string;
  nothing: string;
  /** {n} */
  approve: string;
  cancel: string;
  /** {name} */
  readsAs: string;
  kinds: Record<string, string>;
  via: Record<string, string>;
  failed: string;
};

const fill = (t: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t);

/**
 * The second scan of one sheet: what it found, layer by layer with why it was matched, and nothing read until approved.
 * Every suggestion starts ticked; the user unticks what is wrong.
 */
export function RescanBox({ projectId, fileId, labels, onDone, onClose }: { projectId: string; fileId: string; labels: RescanLabels; onDone: (s: ScanView) => void; onClose: () => void }) {
  const [preview, setPreview] = useState<RescanPreview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"loading" | "ready" | "saving" | "failed">("loading");
  const url = `/api/vmb/projects/${projectId}/files/${fileId}/rescan`;

  useEffect(() => {
    let live = true;
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { preview?: RescanPreview } | null;
        if (!live) return;
        if (!res.ok || !data?.preview) return setState("failed");
        setPreview(data.preview);
        setPicked(new Set(data.preview.suggestions.map((s) => s.layer)));
        setState("ready");
      })
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, [url]);

  const approve = async () => {
    setState("saving");
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept: [...picked] }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { scan?: ScanView } | null;
    if (!res?.ok || !data?.scan) return setState("failed");
    onDone(data.scan);
  };

  const toggle = (layer: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(layer)) n.delete(layer);
      else n.add(layer);
      return n;
    });

  if (state === "loading")
    return (
      <p className="mt-2 flex items-center gap-2 rounded-xl bg-[color:var(--vmb-bg-sunk)] p-3 text-xs text-[color:var(--vmb-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        {labels.loading}
      </p>
    );
  if (state === "failed" || !preview)
    return (
      <p className="mt-2 flex items-center justify-between rounded-xl bg-[color:var(--vmb-bg-sunk)] p-3 text-xs text-[color:var(--vmb-fail)]">
        {labels.failed}
        <button type="button" onClick={onClose} className="text-[color:var(--vmb-muted)]">
          {labels.cancel}
        </button>
      </p>
    );

  const gain = preview.after.entities.read - preview.before.entities.read;
  const chosen = preview.suggestions.filter((s) => picked.has(s.layer)).reduce((a, s) => a + s.pieces, 0);
  return (
    <div className="mt-2 rounded-xl border border-[color:var(--vmb-accent-soft)] bg-[color:var(--vmb-bg-sunk)] p-3 text-xs">
      <p className="flex items-center gap-2 font-bold">
        <Sparkles className="h-3.5 w-3.5 text-[color:var(--vmb-accent)]" aria-hidden />
        {gain > 0 ? fill(labels.found, { n: gain.toLocaleString("en-US") }) : labels.nothing}
      </p>
      {preview.deeper > 0 ? <p className="mt-1 text-[color:var(--vmb-muted)]">{fill(labels.deeper, { n: preview.deeper.toLocaleString("en-US") })}</p> : null}
      {preview.suggestions.length ? (
        <ul className="mt-2.5 space-y-1.5">
          {preview.suggestions.map((s) => (
            <li key={s.layer}>
              <label className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1">
                <input type="checkbox" checked={picked.has(s.layer)} onChange={() => toggle(s.layer)} className="accent-[color:var(--vmb-accent)]" />
                <span className="vmb-mono font-semibold" dir="ltr">
                  {s.layer}
                </span>
                {s.readsAs ? <span className="text-[color:var(--vmb-muted)]">({fill(labels.readsAs, { name: s.readsAs })})</span> : null}
                <span className="vmb-mono text-[color:var(--vmb-muted)]">×{s.pieces.toLocaleString("en-US")}</span>
                <span className="rounded-full bg-[color:var(--vmb-accent-soft)] px-2 py-0.5 font-semibold text-[color:var(--vmb-accent)]">{labels.kinds[s.kind] ?? s.kind}</span>
                <span className="text-[color:var(--vmb-muted)]">· {labels.via[s.via] ?? s.via}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void approve()}
          disabled={state === "saving" || (gain <= 0 && picked.size === 0)}
          className="flex items-center gap-1.5 rounded-full bg-[color:var(--vmb-accent)] px-4 py-1.5 font-bold text-[color:var(--vmb-accent-ink)] disabled:opacity-50"
        >
          {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {fill(labels.approve, { n: (chosen + preview.deeper).toLocaleString("en-US") })}
        </button>
        <button type="button" onClick={onClose} className="rounded-full border border-[color:var(--vmb-line)] px-4 py-1.5">
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
