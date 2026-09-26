"use client";

import React from "react";
import { Undo2, XCircle } from "lucide-react";
import { hebrewFloorplanAuditIssue } from "@/lib/projects/floorplan-viz-ids";
import type { FloorplanVizDismissal } from "@/lib/projects/floorplan-viz-review";

type TFn = (key: string, vars?: Record<string, string>) => string;

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const lang = typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined;
  return date.toLocaleString(lang, { dateStyle: "short", timeStyle: "short" });
}

/**
 * A still's audit findings: which to send to "improve", and which a person
 * looked at and marked wrong. A marked finding stays in the list, struck
 * through and signed, so the override is always visible.
 */
export default function FloorplanVizAuditIssues({
  stillId,
  issues,
  dismissed,
  checked,
  onToggle,
  onDismiss,
  busy,
  t,
}: {
  stillId: string;
  issues: string[];
  dismissed: FloorplanVizDismissal[];
  checked: string[];
  onToggle: (issue: string) => void;
  onDismiss?: (issue: string, dismissed: boolean) => void;
  busy?: boolean;
  t: TFn;
}) {
  const marks = new Map(dismissed.map((row) => [row.issue, row]));
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[10px] font-normal text-amber-950 dark:text-amber-100">
      <p className="mb-1 font-semibold">{t("workspaceWidgets.floorplanViz.auditIssuesTitle")}</p>
      <p className="mb-1.5 text-[9px] text-amber-900/80 dark:text-amber-100/80">
        {t("workspaceWidgets.floorplanViz.auditIssuesPick")}
      </p>
      <ul className="space-y-1">
        {issues.map((issue) => {
          const id = `issue-${stillId}-${issue.slice(0, 24)}`;
          const mark = marks.get(issue);
          const text = hebrewFloorplanAuditIssue(issue);
          return (
            <li key={issue} className="flex items-start gap-2">
              <input
                id={id}
                type="checkbox"
                className="mt-0.5"
                checked={!mark && checked.includes(issue)}
                disabled={busy || Boolean(mark)}
                onChange={() => onToggle(issue)}
              />
              <span className="min-w-0 flex-1 leading-snug">
                <label htmlFor={id} className={mark ? "line-through opacity-70" : "cursor-pointer"}>
                  {text}
                </label>
                {mark ? (
                  <span className="block text-[9px] text-amber-900/80 dark:text-amber-100/80">
                    {t("workspaceWidgets.floorplanViz.markedWrongBy", { by: mark.by, at: formatWhen(mark.at) })}
                  </span>
                ) : null}
              </span>
              {onDismiss ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-600/30 px-1.5 py-0.5 text-[9px] font-semibold hover:bg-amber-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600 disabled:opacity-50"
                  disabled={busy}
                  aria-pressed={Boolean(mark)}
                  aria-label={t(
                    mark
                      ? "workspaceWidgets.floorplanViz.unmarkWrongFor"
                      : "workspaceWidgets.floorplanViz.markWrongFor",
                    { issue: text },
                  )}
                  onClick={() => onDismiss(issue, !mark)}
                >
                  {mark ? <Undo2 size={10} aria-hidden /> : <XCircle size={10} aria-hidden />}
                  {t(mark ? "workspaceWidgets.floorplanViz.unmarkWrong" : "workspaceWidgets.floorplanViz.markWrong")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
