"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ProgressCard } from "@/components/vmb/studio/JobCards";
import { etaText, isLive, stageText, type JobItem, type ProgressText } from "@/components/vmb/projects/types";
import { useLivePoll } from "@/components/vmb/projects/useLivePoll";

export type LiveJobLabels = { title: string; leave: string; failedTitle: string; progress: ProgressText };

/** A project's current job, kept live from the server; when it ends the page reloads its data. */
export function LiveJobCard({ initial, labels }: { initial: JobItem; labels: LiveJobLabels }) {
  const [job, setJob] = useState(initial);
  const router = useRouter();
  useLivePoll<{ job: JobItem }>(`/api/vmb/jobs/${initial.id}`, isLive(job), (d) => {
    setJob(d.job);
    if (!isLive(d.job)) router.refresh();
  });

  if (job.status === "failed") {
    return (
      <section className="vmb-card p-5" role="status">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[color:var(--vmb-fail)]">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {labels.failedTitle}
        </h2>
        <p className="mt-2 text-sm text-[color:var(--vmb-ink-soft)]">{stageText(job, labels.progress)}</p>
        {job.error ? <p className="vmb-mono mt-2 text-xs text-[color:var(--vmb-muted)]">{job.error}</p> : null}
      </section>
    );
  }
  if (!isLive(job)) return null;
  return (
    <ProgressCard
      percent={job.percent}
      labels={{ title: labels.title, stage: stageText(job, labels.progress), eta: etaText(job.etaSeconds, labels.progress), leave: labels.leave }}
    />
  );
}
