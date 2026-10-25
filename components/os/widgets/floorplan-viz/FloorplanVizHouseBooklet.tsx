"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, Home, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { OsButton } from "@/components/os/ui";
import FloorplanVizPaintContact from "@/components/os/widgets/floorplan-viz/FloorplanVizPaintContact";

type TFn = (key: string, vars?: Record<string, string>) => string;

const API = "/api/projects/building-booklet/private-house";
const POLL_MS = 5_000;
const KEPT = "house-booklet-job";

type Cost = { calls: number; images: number; usd: number; ils: number; paint: { ils: number } };
type ReviewModel = {
  id: string;
  name: string;
  pictures: string[];
  reused: string[];
  audit: Array<{ element: string; issue: string; where: string; contradicted?: string }>;
  truth: Array<{ text: string; verdict: "ok" | "fault" | "check" }>;
};
type JobView = {
  id: string;
  name: string;
  status: "measuring" | "awaiting_approval" | "painting" | "done" | "failed";
  phase: "measure" | "paint";
  steps: string[];
  error: string | null;
  resumable: boolean;
  review: {
    models: ReviewModel[];
    estimate: { model: string; pictures: number; toPaint: number; reused: number; likelyIls: number; mostIls: number };
    budgetIls: number;
  } | null;
  approval: { paint: boolean; budgetIls: number | null } | null;
  cost: Cost & { budgetIls: number | null; stopped: boolean };
  /** Pictures the painting did not hold: in the booklet as measured renders. */
  unpainted?: string[];
};

const shekels = (n: number) => `₪${n.toFixed(n < 10 ? 2 : 0)}`;

/**
 * A private house's booklet, in two steps: its sheets are measured and drawn
 * for free, and the review — every render, what the checks found, what
 * painting them would cost — waits for the user. Only an approval, within the
 * ceiling the user sets, paints.
 */
export default function FloorplanVizHouseBooklet({
  t,
  paint,
  contactEmail,
  subscriber,
  initialFiles,
}: {
  t: TFn;
  paint: boolean;
  contactEmail: string;
  subscriber: boolean;
  /** The sheets already uploaded at the identify step. */
  initialFiles?: File[];
}) {
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [name, setName] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  const watch = useCallback(async (id: string) => {
    while (alive.current) {
      const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, { credentials: "include" }).catch(() => null);
      if (res?.status === 404) {
        localStorage.removeItem(KEPT);
        setJob(null);
        return;
      }
      const json = res?.ok ? ((await res.json().catch(() => null)) as JobView | null) : null;
      if (json && alive.current) {
        setJob(json);
        if (json.review) setBudget((b) => b || String(json.review!.budgetIls));
        if (json.status !== "measuring" && json.status !== "painting") return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const kept = localStorage.getItem(KEPT);
    if (kept) void watch(kept);
    return () => {
      alive.current = false;
    };
  }, [watch]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const form = new FormData();
      for (const f of files) form.append("file", f);
      form.append("name", name.trim());
      const res = await fetch(API, { method: "POST", credentials: "include", body: form });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        toast.error(json.error ?? t("workspaceWidgets.floorplanViz.houseFailed"));
        return;
      }
      localStorage.setItem(KEPT, json.id);
      setBudget("");
      void watch(json.id);
    } finally {
      setBusy(false);
    }
  }, [files, name, t, watch]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (!job) return;
      setBusy(true);
      try {
        const res = await fetch(API, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: job.id, ...body }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(json.error ?? t("workspaceWidgets.floorplanViz.houseFailed"));
          return;
        }
        void watch(job.id);
      } finally {
        setBusy(false);
      }
    },
    [job, t, watch],
  );

  const running = job?.status === "measuring" || job?.status === "painting";
  const review = job?.status === "awaiting_approval" ? job.review : null;
  // A painting that stopped short: approved again under a higher ceiling, or its booklet made as it stands.
  const stoppedPainting = job?.status === "failed" && job.phase === "paint" && job.approval?.paint === true;
  const cap = Number(budget);
  const capOk = Number.isFinite(cap) && cap > 0 && (!stoppedPainting || cap > (job?.cost.paint.ils ?? 0));
  const lastStep = job?.steps[job.steps.length - 1]?.replace(/^\d+s /, "") ?? "";

  return (
    <section className="rounded-xl border border-[color:var(--border-main)] p-3">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold">
        <Home size={14} className="text-violet-600" aria-hidden />
        {t("workspaceWidgets.floorplanViz.houseTitle")}
      </p>
      <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">{t("workspaceWidgets.floorplanViz.houseHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".dwf,.dxf,.json"
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <OsButton variant="secondary" size="sm" icon={<Upload size={12} aria-hidden />} disabled={running || busy} onClick={() => fileRef.current?.click()}>
          {files.length ? t("workspaceWidgets.floorplanViz.houseFilesChosen", { count: String(files.length) }) : t("workspaceWidgets.floorplanViz.houseFiles")}
        </OsButton>
        <input
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
          placeholder={t("workspaceWidgets.floorplanViz.bookletName")}
          value={name}
          maxLength={120}
          disabled={running || busy}
          onChange={(e) => setName(e.target.value)}
        />
        <OsButton variant="secondary" size="sm" loading={busy && !job} disabled={!subscriber || !files.length || running || busy} onClick={() => void start()}>
          {t("workspaceWidgets.floorplanViz.houseStart")}
        </OsButton>
      </div>

      {job ? (
        <div className="mt-2 space-y-2 text-[11px]" aria-live="polite">
          {running ? (
            <p>
              {job.status === "measuring" ? t("workspaceWidgets.floorplanViz.houseMeasuring") : t("workspaceWidgets.floorplanViz.housePainting")}
              {lastStep ? <span className="block truncate text-[10px] text-[color:var(--foreground-muted)]">{lastStep}</span> : null}
            </p>
          ) : null}
          <p className="text-[10px] text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.floorplanViz.houseCost", { ils: shekels(job.cost.ils), images: String(job.cost.images) })}
            {job.cost.budgetIls != null ? ` · ${t("workspaceWidgets.floorplanViz.houseCap", { ils: shekels(job.cost.budgetIls) })}` : ""}
          </p>

          {review ? (
            <div className="space-y-2">
              <p className="font-semibold">{t("workspaceWidgets.floorplanViz.houseReview")}</p>
              {review.models.map((m) => (
                <div key={m.id} className="rounded-lg border border-[color:var(--border-main)] p-2">
                  <p className="mb-1 font-semibold">{m.name}</p>
                  <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                    {m.pictures.map((p) => (
                      <a key={p} href={`${API}?id=${encodeURIComponent(job.id)}&picture=${encodeURIComponent(`${m.id}/${p}`)}`} target="_blank" rel="noopener noreferrer" title={p}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${API}?id=${encodeURIComponent(job.id)}&picture=${encodeURIComponent(`${m.id}/${p}`)}`}
                          alt={p}
                          loading="lazy"
                          className={`aspect-[4/3] w-full rounded object-cover ${m.reused.includes(p) ? "ring-2 ring-emerald-500" : ""}`}
                        />
                      </a>
                    ))}
                  </div>
                  {m.truth.filter((f) => f.verdict !== "ok").length || m.audit.length ? (
                    <ul className="mt-1 list-disc ps-4 text-[10px]">
                      {m.truth
                        .filter((f) => f.verdict !== "ok")
                        .map((f, i) => (
                          <li key={`t${i}`} className={f.verdict === "fault" ? "text-red-600" : "text-amber-600"}>
                            {f.text}
                          </li>
                        ))}
                      {m.audit.map((f, i) => (
                        <li key={`a${i}`} className="text-amber-600">
                          {`${f.element}: ${f.issue} (${f.where})`}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[10px] text-emerald-600">{t("workspaceWidgets.floorplanViz.houseNoFindings")}</p>
                  )}
                </div>
              ))}
              <p>
                {t("workspaceWidgets.floorplanViz.houseEstimate", {
                  toPaint: String(review.estimate.toPaint),
                  reused: String(review.estimate.reused),
                  likely: shekels(review.estimate.likelyIls),
                  most: shekels(review.estimate.mostIls),
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {paint ? (
                  <>
                    <label className="flex items-center gap-1.5">
                      {t("workspaceWidgets.floorplanViz.houseBudget")}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="w-20 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
                        value={budget}
                        disabled={busy}
                        onChange={(e) => setBudget(e.target.value)}
                      />
                    </label>
                    <OsButton variant="primary" size="sm" loading={busy} disabled={busy || !capOk} onClick={() => void act({ action: "approve", paint: true, budgetIls: cap })}>
                      {t("workspaceWidgets.floorplanViz.houseApprove", { ils: capOk ? shekels(cap) : "—" })}
                    </OsButton>
                  </>
                ) : (
                  <FloorplanVizPaintContact t={t} email={contactEmail} />
                )}
                <OsButton variant="secondary" size="sm" disabled={busy} onClick={() => void act({ action: "approve", paint: false })}>
                  {t("workspaceWidgets.floorplanViz.houseNoPaint")}
                </OsButton>
              </div>
              {capOk && cap < review.estimate.mostIls ? <p className="text-[10px] text-amber-600">{t("workspaceWidgets.floorplanViz.houseCapWarning")}</p> : null}
            </div>
          ) : null}

          {job.status === "done" ? (
            <a className="inline-flex items-center gap-1.5 font-semibold text-violet-600 underline" href={`${API}?id=${encodeURIComponent(job.id)}&pdf=1`} target="_blank" rel="noopener noreferrer">
              <Download size={12} aria-hidden />
              {t("workspaceWidgets.floorplanViz.houseDownload")}
            </a>
          ) : null}
          {job.status === "done" && job.unpainted?.length ? (
            <p className="text-[10px] text-amber-600">{t("workspaceWidgets.floorplanViz.houseUnpainted", { count: String(job.unpainted.length), list: job.unpainted.join(", ") })}</p>
          ) : null}

          {job.status === "failed" ? (
            <div className="space-y-1">
              <p className="text-red-600">{`${t("workspaceWidgets.floorplanViz.houseFailed")}${job.error ? ` — ${job.error}` : ""}`}</p>
              <div className="flex flex-wrap items-center gap-2">
                {job.resumable && (job.phase !== "paint" || paint) ? (
                  <OsButton variant="secondary" size="sm" icon={<RotateCcw size={12} aria-hidden />} disabled={busy} onClick={() => void act({ action: "retry" })}>
                    {t("workspaceWidgets.floorplanViz.houseRetry")}
                  </OsButton>
                ) : null}
                {stoppedPainting ? (
                  <>
                    {paint ? (
                      <>
                        <label className="flex items-center gap-1.5">
                          {t("workspaceWidgets.floorplanViz.houseNewBudget")}
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-20 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
                            value={budget}
                            disabled={busy}
                            onChange={(e) => setBudget(e.target.value)}
                          />
                        </label>
                        <OsButton variant="primary" size="sm" loading={busy} disabled={busy || !capOk} onClick={() => void act({ action: "approve", paint: true, budgetIls: cap })}>
                          {t("workspaceWidgets.floorplanViz.houseApprove", { ils: capOk ? shekels(cap) : "—" })}
                        </OsButton>
                      </>
                    ) : (
                      <FloorplanVizPaintContact t={t} email={contactEmail} />
                    )}
                    <OsButton variant="secondary" size="sm" disabled={busy} onClick={() => void act({ action: "accept" })}>
                      {t("workspaceWidgets.floorplanViz.houseAccept")}
                    </OsButton>
                  </>
                ) : null}
              </div>
              {stoppedPainting ? (
                <p className="text-[10px] text-[color:var(--foreground-muted)]">{t("workspaceWidgets.floorplanViz.houseStoppedHint", { ils: shekels(job.cost.paint.ils) })}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
