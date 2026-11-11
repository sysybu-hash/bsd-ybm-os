"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, BellRing } from "lucide-react";
import { ProgressCard } from "@/components/vmb/studio/JobCards";
import { etaText, isLive, stageText, type JobItem, type ProgressText } from "@/components/vmb/projects/types";
import { useLivePoll } from "@/components/vmb/projects/useLivePoll";

export type LiveJobLabels = {
  title: string;
  leave: string;
  failedTitle: string;
  progress: ProgressText;
  /** Browser notification when the job ends; absent where the shell gives no notifications. */
  notify?: { ask: string; on: string; done: string; failed: string };
};

const canNotify = () => typeof window !== "undefined" && "Notification" in window;

/**
 * A project's current job, kept live from the server; when it ends the page reloads its data, and — if the user asked —
 * the browser says so even when the tab is in the background. The engine's raw error is never shown here.
 */
export function LiveJobCard({ initial, labels }: { initial: JobItem; labels: LiveJobLabels }) {
  const [job, setJob] = useState(initial);
  const [notify, setNotify] = useState(false);
  const router = useRouter();
  useLivePoll<{ job: JobItem }>(`/api/vmb/jobs/${initial.id}`, isLive(job), (d) => {
    setJob(d.job);
    if (isLive(d.job)) return;
    if (notify && labels.notify && canNotify() && Notification.permission === "granted") {
      try {
        new Notification(d.job.status === "done" ? labels.notify.done : labels.notify.failed);
      } catch {
        /* some browsers only notify from a service worker: the page still refreshes */
      }
    }
    router.refresh();
  });

  const ask = async () => {
    if (!canNotify()) return;
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setNotify(p === "granted");
  };

  if (job.status === "failed") {
    return (
      <section className="vmb-card p-5" role="status">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[color:var(--vmb-fail)]">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {labels.failedTitle}
        </h2>
        <p className="mt-2 text-sm text-[color:var(--vmb-ink-soft)]">{stageText(job, labels.progress)}</p>
      </section>
    );
  }
  if (!isLive(job)) return null;
  return (
    <div className="space-y-2">
      <ProgressCard
        percent={job.percent}
        labels={{ title: labels.title, stage: stageText(job, labels.progress), eta: etaText(job.etaSeconds, labels.progress), leave: labels.leave }}
      />
      {labels.notify ? (
        <button
          type="button"
          onClick={() => void ask()}
          disabled={notify}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-[color:var(--vmb-line)] px-4 py-1.5 text-xs text-[color:var(--vmb-ink-soft)] disabled:text-[color:var(--vmb-pass)]"
        >
          {notify ? <BellRing className="h-3.5 w-3.5" aria-hidden /> : <Bell className="h-3.5 w-3.5" aria-hidden />}
          {notify ? labels.notify.on : labels.notify.ask}
        </button>
      ) : null}
    </div>
  );
}
