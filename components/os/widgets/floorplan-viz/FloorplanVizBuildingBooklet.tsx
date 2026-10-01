"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Download } from "lucide-react";
import { toast } from "sonner";
import { OsButton } from "@/components/os/ui";
import { uploadPlanToBlob } from "@/components/os/widgets/floorplan-viz/plan-source";
import type { BookletJobView } from "@/lib/projects/building/booklet-job";

type TFn = (key: string, vars?: Record<string, string>) => string;

/** Between steps while the page drives the job, and between looks while QStash does. */
const POLL_MS = 5_000;

/**
 * A booklet for the whole building, from the permit strip already uploaded.
 *
 * The job runs on the server in steps. Where QStash drives it the page only
 * watches; where it does not, the page asks for each step itself — the step
 * route runs one only if nobody else holds the job, so asking is always safe.
 */
export default function FloorplanVizBuildingBooklet({ t, drawing, projectId }: { t: TFn; drawing: File; projectId?: string }) {
  const [name, setName] = useState(() => drawing.name.replace(/\.[^.]+$/u, ""));
  const [job, setJob] = useState<BookletJobView | null>(null);
  const [queued, setQueued] = useState(false);
  const [starting, setStarting] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const drive = useCallback(async (id: string, byQueue: boolean) => {
    while (alive.current) {
      const res = await fetch(`/api/projects/building-booklet/${encodeURIComponent(id)}${byQueue ? "" : "/step"}`, {
        method: byQueue ? "GET" : "POST",
        credentials: "include",
      }).catch(() => null);
      const json = res ? ((await res.json().catch(() => ({}))) as { job?: BookletJobView }) : {};
      if (json.job && alive.current) setJob(json.job);
      if (json.job && (json.job.status === "done" || json.job.status === "failed")) return;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      // Its own copy: a visualisation run deletes the upload it reads.
      const blobUrl = await uploadPlanToBlob(drawing, { always: true });
      if (!blobUrl) {
        toast.error(t("workspaceWidgets.floorplanViz.dwfNeedsStorage"));
        return;
      }
      const res = await fetch("/api/projects/building-booklet", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl, name: name.trim(), ...(projectId ? { projectId } : {}) }),
      });
      const json = (await res.json()) as { job?: BookletJobView; queued?: boolean; error?: string };
      if (!res.ok || !json.job) {
        toast.error(json.error ?? t("workspaceWidgets.floorplanViz.bookletFailed"));
        return;
      }
      setJob(json.job);
      setQueued(Boolean(json.queued));
      void drive(json.job.id, Boolean(json.queued));
    } finally {
      setStarting(false);
    }
  }, [drawing, drive, name, projectId, t]);

  const running = job != null && (job.status === "queued" || job.status === "running");
  const stageText = () => {
    if (!job) return "";
    const p = job.progress;
    if (job.status === "done") return t("workspaceWidgets.floorplanViz.bookletDone");
    if (job.status === "failed") return `${t("workspaceWidgets.floorplanViz.bookletFailed")}${job.error ? ` — ${job.error}` : ""}`;
    if (job.stage === "views") return t("workspaceWidgets.floorplanViz.bookletStageViews", { done: String(p.views) });
    if (job.stage === "apartments") return t("workspaceWidgets.floorplanViz.bookletStageApartments", { done: String(p.apartments), total: String(p.apartmentsTotal) });
    if (job.stage === "assemble") return t("workspaceWidgets.floorplanViz.bookletStageAssemble");
    return t("workspaceWidgets.floorplanViz.bookletStageModel");
  };

  return (
    <section className="rounded-xl border border-[color:var(--border-main)] p-3">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold">
        <BookOpen size={14} className="text-violet-600" aria-hidden />
        {t("workspaceWidgets.floorplanViz.bookletTitle")}
      </p>
      <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">{t("workspaceWidgets.floorplanViz.bookletHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]">
          {t("workspaceWidgets.floorplanViz.bookletName")}
          <input
            className="min-w-0 flex-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
            value={name}
            maxLength={120}
            disabled={running || starting}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <OsButton variant="secondary" size="sm" loading={starting} disabled={!name.trim() || running || starting} onClick={() => void start()}>
          {t("workspaceWidgets.floorplanViz.bookletStart")}
        </OsButton>
      </div>
      {job ? (
        <div className="mt-2 space-y-1 text-[11px]" aria-live="polite">
          <p className={job.status === "failed" ? "text-red-600" : ""}>{stageText()}</p>
          {running ? (
            <p className="text-[10px] text-[color:var(--foreground-muted)]">
              {queued ? t("workspaceWidgets.floorplanViz.bookletBackground") : t("workspaceWidgets.floorplanViz.bookletKeepOpen")}
            </p>
          ) : null}
          {job.status === "done" && job.resultUrl ? (
            <a
              className="inline-flex items-center gap-1.5 font-semibold text-violet-600 underline"
              href={job.resultUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download size={12} aria-hidden />
              {t("workspaceWidgets.floorplanViz.bookletDownload")}
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
