"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanSearch } from "lucide-react";
import { ScanFileRow, type RowState, type ScanLabels } from "@/components/vmb/scan/ScanFileRow";
import type { StoredFile } from "@/components/vmb/upload/useUploadQueue";
import type { ScanView } from "@/lib/vmb/scan-view";

/** Kinds the scan reads today; the others are counted and named as waiting for their reader. */
const SCANNABLE = new Set(["dxf"]);

/**
 * How much of each sheet the system read. Every DXF in the project is scanned on its own once it is uploaded, one at a time,
 * and a scan can be run again. What was left out is listed with its reason — nothing is dropped silently.
 */
export function ScanPanel({ projectId, files, initial, labels }: { projectId: string; files: StoredFile[]; initial: ScanView[]; labels: ScanLabels }) {
  const [local, setLocal] = useState<Record<string, ScanView>>({});
  const [states, setStates] = useState<Record<string, RowState>>({});
  const tried = useRef(new Set<string>());
  const chain = useRef<Promise<void>>(Promise.resolve());

  const fromServer = new Map(initial.map((s) => [s.fileName, s]));
  const scannable = files.filter((f) => SCANNABLE.has(f.kind));
  const others = files.length - scannable.length;
  const scanOf = (f: StoredFile) => local[f.id] ?? fromServer.get(f.relPath) ?? null;

  const run = useCallback(
    (f: StoredFile) => {
      chain.current = chain.current.then(async () => {
        setStates((s) => ({ ...s, [f.id]: { status: "scanning" } }));
        try {
          const res = await fetch(`/api/vmb/projects/${projectId}/files/${f.id}/scan`, { method: "POST" });
          const data = (await res.json().catch(() => null)) as { scan?: ScanView; code?: string } | null;
          if (!res.ok || !data?.scan) throw new Error(data?.code ?? "generic");
          const scan = data.scan;
          setLocal((l) => ({ ...l, [f.id]: scan }));
          setStates((s) => ({ ...s, [f.id]: null }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "generic";
          setStates((s) => ({ ...s, [f.id]: { status: "failed", error: /^[a-z_]+$/.test(msg) ? msg : "generic" } }));
        }
      });
    },
    [projectId],
  );

  // A sheet with no scan yet is scanned once, on its own; a failure waits for the user's retry.
  const pendingIds = scannable.filter((f) => !local[f.id] && !fromServer.has(f.relPath)).map((f) => f.id).join(",");
  useEffect(() => {
    for (const f of scannable) {
      if (pendingIds.split(",").includes(f.id) && !tried.current.has(f.id)) {
        tried.current.add(f.id);
        run(f);
      }
    }
    // `scannable` is rebuilt each render; the ids string is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIds, run]);

  const rescan = (f: StoredFile) => {
    setStates((s) => ({ ...s, [f.id]: { status: "waiting" } }));
    run(f);
  };

  const stateOf = (f: StoredFile): RowState => states[f.id] ?? (scanOf(f) ? null : { status: "waiting" });

  return (
    <section className="vmb-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]">
          <ScanSearch className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-bold">{labels.title}</h2>
          <p className="mt-0.5 text-xs text-[color:var(--vmb-ink-soft)]">{labels.subtitle}</p>
        </div>
      </div>
      {scannable.length ? (
        <ul className="mt-3 divide-y divide-[color:var(--vmb-line)]" aria-live="polite">
          {scannable.map((f) => (
            <ScanFileRow key={f.id} name={f.relPath} scan={states[f.id]?.status === "scanning" ? null : scanOf(f)} state={stateOf(f)} labels={labels} onRescan={() => rescan(f)} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[color:var(--vmb-muted)]">{labels.empty}</p>
      )}
      {others > 0 ? <p className="mt-3 border-t border-[color:var(--vmb-line)] pt-3 text-xs text-[color:var(--vmb-muted)]">{labels.notScannedYet.replace("{n}", String(others))}</p> : null}
    </section>
  );
}
