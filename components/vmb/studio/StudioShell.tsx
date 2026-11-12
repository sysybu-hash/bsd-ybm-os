"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { StudioFrame, type FrameLabels } from "@/components/vmb/studio/StudioFrame";

export type ShellLabels = FrameLabels & {
  projectName: string;
  projectMeta: string;
  steps: string[];
};

/** One project inside the frame: hero with its name, and the 7-step rail always visible. */
export function StudioShell({
  labels,
  current,
  credits,
  account,
  children,
}: {
  labels: ShellLabels;
  current: number;
  credits: number | null;
  account?: ReactNode;
  children: ReactNode;
}) {
  return (
    <StudioFrame labels={labels} active="projects" credits={credits} account={account}>
      <div className="relative overflow-hidden rounded-[var(--vmb-radius)] text-white">
        <Image src="/floorplan-viz/styles/jerusalem_stone.jpg" alt="" fill sizes="100vw" className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-l from-black/85 via-black/60 to-black/20" />
        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <h1 className="vmb-display text-3xl font-extrabold sm:text-5xl">{labels.projectName}</h1>
          <p className="mt-2 text-sm text-white/65">{labels.projectMeta}</p>
        </div>
      </div>
      <ol className="mt-6 flex gap-1 overflow-x-auto pb-1" aria-label="steps">
        {labels.steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={s}
              aria-current={active ? "step" : undefined}
              className={`flex min-w-[112px] flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                active
                  ? "border-[color:var(--vmb-accent)] bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-ink)]"
                  : done
                    ? "border-[color:var(--vmb-line)] text-[color:var(--vmb-ink-soft)]"
                    : "border-dashed border-[color:var(--vmb-line)] text-[color:var(--vmb-muted)]"
              }`}
            >
              <span
                className={`vmb-mono grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                  done ? "bg-[color:var(--vmb-pass)] text-[color:var(--vmb-bg)]" : active ? "bg-[color:var(--vmb-accent)] text-[color:var(--vmb-accent-ink)]" : "border border-[color:var(--vmb-line-strong)]"
                }`}
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
              </span>
              {s}
            </li>
          );
        })}
      </ol>
      <div className="mt-6">{children}</div>
    </StudioFrame>
  );
}
