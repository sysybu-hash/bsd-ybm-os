"use client";

import { useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { ProjectCard, type CardLabels } from "@/components/vmb/projects/ProjectCard";
import { NewProjectDialog, type NewProjectLabels } from "@/components/vmb/projects/NewProjectDialog";
import { isLive, type ProjectItem } from "@/components/vmb/projects/types";
import { useLivePoll } from "@/components/vmb/projects/useLivePoll";

export type BoardLabels = {
  title: string;
  subtitle: string;
  newProject: string;
  emptyTitle: string;
  emptyBody: string;
  card: CardLabels;
  dialog: NewProjectLabels;
};

/** The office's projects. While any job runs, the board refreshes itself every two seconds. */
export function ProjectsBoard({ initial, labels }: { initial: ProjectItem[]; labels: BoardLabels }) {
  const [projects, setProjects] = useState(initial);
  const [dialog, setDialog] = useState(false);
  const anyLive = projects.some((p) => isLive(p.lastJob));
  useLivePoll<{ projects: ProjectItem[] }>("/api/vmb/projects", anyLive, (d) => setProjects(d.projects));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="vmb-display text-4xl font-extrabold sm:text-5xl">{labels.title}</h1>
          <p className="mt-2 text-sm text-[color:var(--vmb-ink-soft)]">{labels.subtitle}</p>
        </div>
        {projects.length > 0 ? (
          <button
            type="button"
            onClick={() => setDialog(true)}
            className="flex items-center gap-2 rounded-full bg-[color:var(--vmb-accent)] px-5 py-2.5 text-sm font-bold text-[color:var(--vmb-accent-ink)] shadow-[0_8px_30px_-10px_var(--vmb-accent)]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {labels.newProject}
          </button>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <button
          type="button"
          onClick={() => setDialog(true)}
          className="vmb-card group relative mt-8 flex w-full flex-col items-center overflow-hidden px-6 py-16 text-center"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--vmb-accent-soft),transparent_65%)]" />
          <span className="relative grid h-16 w-16 place-items-center rounded-2xl border border-dashed border-[color:var(--vmb-accent)] text-[color:var(--vmb-accent)] transition group-hover:scale-105 motion-reduce:transition-none">
            <FolderPlus className="h-7 w-7" aria-hidden />
          </span>
          <span className="vmb-display relative mt-5 text-2xl font-extrabold">{labels.emptyTitle}</span>
          <span className="relative mt-2 max-w-md text-sm text-[color:var(--vmb-ink-soft)]">{labels.emptyBody}</span>
          <span className="relative mt-6 flex items-center gap-2 rounded-full bg-[color:var(--vmb-accent)] px-6 py-2.5 text-sm font-bold text-[color:var(--vmb-accent-ink)]">
            <Plus className="h-4 w-4" aria-hidden />
            {labels.newProject}
          </span>
        </button>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="contents">
              <ProjectCard project={p} labels={labels.card} />
            </li>
          ))}
        </ul>
      )}

      <NewProjectDialog open={dialog} onClose={() => setDialog(false)} labels={labels.dialog} />
    </>
  );
}
