"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FolderUp, Loader2, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { filesFromDrop, filesFromInput } from "@/components/vmb/upload/folder-drop";
import { useUploadQueue, type QueueItem, type StoredFile } from "@/components/vmb/upload/useUploadQueue";

export type UploadLabels = {
  dropTitle: string;
  dropBody: string;
  dropActive: string;
  pickFolder: string;
  pickFiles: string;
  /** Templates: {n} count, {size} total. */
  summary: string;
  skipped: string;
  queued: string;
  uploading: string;
  saving: string;
  done: string;
  retry: string;
  remove: string;
  /** Error text by server code, plus "generic". */
  errors: Record<string, string>;
};

export const fmtSize = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const KIND_TAG: Record<string, string> = { dxf: "DXF", dwg: "DWG", pdf: "PDF", dwf: "DWF", image: "IMG" };

function Row({ name, kind, size, right }: { name: string; kind: string; size: number; right: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="vmb-mono w-11 shrink-0 rounded-md border border-[color:var(--vmb-line)] py-0.5 text-center text-[10px] font-semibold text-[color:var(--vmb-ink-soft)]">
        {KIND_TAG[kind] ?? kind}
      </span>
      <span className="vmb-mono min-w-0 flex-1 truncate text-xs" dir="ltr" style={{ unicodeBidi: "plaintext", textAlign: "right" }} title={name}>
        {name}
      </span>
      <span className="vmb-mono hidden shrink-0 text-[11px] text-[color:var(--vmb-muted)] sm:block">{fmtSize(size)}</span>
      <span className="flex w-28 shrink-0 items-center justify-end gap-1.5 text-xs">{right}</span>
    </li>
  );
}

/** Drop a whole project folder (or pick files); each file goes straight to storage with live progress. */
export function UploadZone({ projectId, initial, labels }: { projectId: string; initial: StoredFile[]; labels: UploadLabels }) {
  const router = useRouter();
  const [files, setFiles] = useState(initial);
  const [over, setOver] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const q = useUploadQueue(projectId, (f) => {
    setFiles((all) => [...all.filter((x) => x.relPath !== f.relPath), f].sort((a, b) => a.relPath.localeCompare(b.relPath)));
  });

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    q.add(await filesFromDrop(e.dataTransfer));
  };

  const remove = async (f: StoredFile) => {
    const res = await fetch(`/api/vmb/projects/${projectId}/files/${f.id}`, { method: "DELETE" });
    if (res.ok) {
      setFiles((all) => all.filter((x) => x.id !== f.id));
      router.refresh();
    }
  };

  const total = files.reduce((a, f) => a + f.size, 0);
  const active = q.items.filter((i) => i.status !== "done");
  const status = (i: QueueItem) =>
    i.status === "failed" ? (
      <>
        <span className="truncate text-[color:var(--vmb-fail)]" title={labels.errors[i.error ?? "generic"] ?? labels.errors.generic}>
          {labels.errors[i.error ?? "generic"] ?? labels.errors.generic}
        </span>
        <button type="button" onClick={() => q.retry(i.key)} aria-label={labels.retry} className="rounded-full p-1 hover:bg-[color:var(--vmb-bg-sunk)]">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </>
    ) : i.status === "uploading" ? (
      <span className="flex w-full items-center gap-2">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-[color:var(--vmb-line)]">
          <span className="vmb-progress-bar block h-full rounded-full" style={{ width: `${Math.max(3, i.percent)}%` }} />
        </span>
        <span className="vmb-mono text-[11px]">{i.percent}%</span>
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-[color:var(--vmb-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        {i.status === "saving" ? labels.saving : labels.queued}
      </span>
    );

  return (
    <section className="vmb-card overflow-hidden">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center px-6 text-center transition ${files.length + active.length > 0 ? "py-8" : "py-14"} ${
          over ? "bg-[color:var(--vmb-accent-soft)]" : ""
        }`}
      >
        <div className="pointer-events-none absolute inset-3 rounded-[calc(var(--vmb-radius)-6px)] border-2 border-dashed border-[color:var(--vmb-line-strong)]" />
        <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]">
          <UploadCloud className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="vmb-display relative mt-4 text-2xl font-extrabold">{over ? labels.dropActive : labels.dropTitle}</h2>
        <p className="relative mt-1.5 max-w-md text-sm text-[color:var(--vmb-ink-soft)]">{labels.dropBody}</p>
        <div className="relative mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            className="flex items-center gap-2 rounded-full bg-[color:var(--vmb-accent)] px-5 py-2.5 text-sm font-bold text-[color:var(--vmb-accent-ink)]"
          >
            <FolderUp className="h-4 w-4" aria-hidden />
            {labels.pickFolder}
          </button>
          <button type="button" onClick={() => filesInput.current?.click()} className="rounded-full border border-[color:var(--vmb-line)] px-5 py-2.5 text-sm font-semibold hover:border-[color:var(--vmb-line-strong)]">
            {labels.pickFiles}
          </button>
        </div>
        <p className="vmb-mono relative mt-4 text-[11px] text-[color:var(--vmb-muted)]">DXF · DWG · PDF · DWF · JPG · PNG · HEIC</p>
        <input
          ref={folderInput}
          type="file"
          multiple
          className="hidden"
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => {
            q.add(filesFromInput(e.target.files));
            e.target.value = "";
          }}
        />
        <input
          ref={filesInput}
          type="file"
          multiple
          className="hidden"
          accept=".dxf,.dwg,.pdf,.dwf,.dwfx,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff"
          onChange={(e) => {
            q.add(filesFromInput(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {q.skipped.length > 0 ? (
        <p className="flex items-start gap-2 border-t border-[color:var(--vmb-line)] px-5 py-3 text-xs text-[color:var(--vmb-warn)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {labels.skipped.replace("{n}", String(q.skipped.length))}{" "}
            <span className="vmb-mono text-[color:var(--vmb-muted)]" dir="ltr">
              {q.skipped.slice(0, 4).join(" · ")}
              {q.skipped.length > 4 ? " …" : ""}
            </span>
          </span>
        </p>
      ) : null}

      {active.length + files.length > 0 ? (
        <div className="border-t border-[color:var(--vmb-line)] px-5 py-3">
          <p className="flex items-center justify-between text-xs text-[color:var(--vmb-muted)]" aria-live="polite">
            <span>{labels.summary.replace("{n}", String(files.length)).replace("{size}", `⁦${fmtSize(total)}⁩`)}</span>
            {q.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Check className="h-3.5 w-3.5 text-[color:var(--vmb-pass)]" aria-hidden />}
          </p>
          <ul className="mt-1 max-h-[420px] divide-y divide-[color:var(--vmb-line)] overflow-y-auto">
            {active.map((i) => (
              <Row key={i.key} name={i.relPath} kind={i.kind} size={i.size} right={status(i)} />
            ))}
            {files.map((f) => (
              <Row
                key={f.id}
                name={f.relPath}
                kind={f.kind}
                size={f.size}
                right={
                  <>
                    <Check className="h-3.5 w-3.5 text-[color:var(--vmb-pass)]" aria-label={labels.done} />
                    <button type="button" onClick={() => void remove(f)} aria-label={labels.remove} className="rounded-full p-1 text-[color:var(--vmb-muted)] hover:bg-[color:var(--vmb-bg-sunk)] hover:text-[color:var(--vmb-fail)]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
