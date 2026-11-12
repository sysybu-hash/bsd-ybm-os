"use client";

import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, DoorOpen, Factory, Home, Landmark, type LucideIcon } from "lucide-react";
import { VmbLink } from "@/components/vmb/VmbLink";
import { etaText, isLive, stageText, type ProgressText, type ProjectItem } from "@/components/vmb/projects/types";

export const KIND_ICONS: Record<string, LucideIcon> = {
  flat: DoorOpen,
  house: Home,
  building: Building2,
  industrial: Factory,
  public: Landmark,
};

export type CardLabels = {
  kinds: Record<string, string>;
  statuses: Record<string, string>;
  /** Template with {date}. */
  updated: string;
  open: string;
  failed: string;
  progress: ProgressText;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });

/** One project on the board. A running job shows its live bar, stage and time left right on the card. */
export function ProjectCard({ project, labels }: { project: ProjectItem; labels: CardLabels }) {
  const Icon = KIND_ICONS[project.kind] ?? Building2;
  const job = project.lastJob;
  const live = isLive(job);
  const failed = job?.status === "failed";
  const done = project.status === "done";

  return (
    <VmbLink
      href={`/app/p/${project.id}`}
      className="vmb-card group relative flex min-h-[208px] flex-col overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-[color:var(--vmb-line-strong)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {live ? <div className="pointer-events-none absolute -top-20 -left-16 h-48 w-48 rounded-full bg-[color:var(--vmb-accent)]/15 blur-[70px]" /> : null}
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span
          className={`flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${
            failed
              ? "border-[color:var(--vmb-fail)]/40 bg-[color:var(--vmb-fail)]/10 text-[color:var(--vmb-fail)]"
              : done
                ? "border-[color:var(--vmb-pass)]/40 bg-[color:var(--vmb-pass)]/10 text-[color:var(--vmb-pass)]"
                : live
                  ? "border-[color:var(--vmb-accent)]/40 bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]"
                  : "border-[color:var(--vmb-line)] text-[color:var(--vmb-muted)]"
          }`}
        >
          {failed ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : null}
          {failed ? labels.failed : (labels.statuses[project.status] ?? project.status)}
        </span>
      </div>

      <h3 className="mt-4 line-clamp-2 text-lg font-bold leading-snug" style={{ unicodeBidi: "plaintext" }}>
        {project.name}
      </h3>
      <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">
        {labels.kinds[project.kind] ?? project.kind} · {labels.updated.replace("{date}", day(project.updatedAt))}
      </p>

      <div className="mt-auto pt-5">
        {live && job ? (
          <div aria-live="polite">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-[color:var(--vmb-ink-soft)]">{stageText(job, labels.progress)}</span>
              <span className="vmb-mono text-base font-semibold">{job.percent}%</span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--vmb-line)]"
              role="progressbar"
              aria-valuenow={job.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={project.name}
            >
              <div className="vmb-progress-bar h-full rounded-full" style={{ width: `${Math.max(2, job.percent)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-[color:var(--vmb-muted)]">{etaText(job.etaSeconds, labels.progress)}</p>
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--vmb-accent)]">
            {labels.open}
            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5 rtl:rotate-0 ltr:rotate-180 motion-reduce:transition-none" aria-hidden />
          </span>
        )}
      </div>
    </VmbLink>
  );
}
