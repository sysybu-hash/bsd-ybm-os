"use client";

import React, { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Pencil, ScanSearch, Sparkles, Trash2 } from "lucide-react";
import type { FloorplanLayout, FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import {
  hebrewFloorplanAuditIssue,
  selectedFromAttemptGroup,
  type FloorplanVizAttemptGroup,
} from "@/lib/projects/floorplan-viz-ids";
import type { FloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region";
import { OsButton, OsIconButton } from "@/components/os/ui";
import { fileNameOf, srcOf } from "@/components/os/widgets/floorplan-viz/FloorplanVizLightbox";
import FloorplanVizEditMark from "@/components/os/widgets/floorplan-viz/FloorplanVizEditMark";
import PlanLocatorMap from "@/components/os/widgets/floorplan-viz/PlanLocatorMap";
import { locatorFocusForView } from "@/lib/projects/floorplan-locator";

type TFn = (key: string, vars?: Record<string, string>) => string;

function label(resolved: string, key: string, fallback: string): string {
  return resolved === key ? fallback : resolved;
}

export default function FloorplanVizAttemptCard({
  group,
  globalIndex,
  onOpen,
  t,
  layout,
  planSrc,
  canManage,
  editing,
  onEdit,
  onImprove,
  onRescan,
  onDelete,
  onSelect,
}: {
  group: FloorplanVizAttemptGroup;
  globalIndex: number;
  onOpen: (img: FloorplanVizImage) => void;
  t: TFn;
  layout: FloorplanLayout | null;
  planSrc: string | null;
  canManage?: boolean;
  editing?: boolean;
  onEdit?: (img: FloorplanVizImage, instruction: string, region?: FloorplanVizEditRegion) => void;
  onImprove?: (img: FloorplanVizImage, failures: string[]) => void;
  onRescan?: (img: FloorplanVizImage) => void;
  onDelete?: (img: FloorplanVizImage) => void;
  onSelect?: (img: FloorplanVizImage) => void;
}) {
  const [editingOpen, setEditingOpen] = useState(false);
  const submittedEdit = React.useRef(false);

  const selected = selectedFromAttemptGroup(group);

  useEffect(() => {
    if (submittedEdit.current && !editing) {
      submittedEdit.current = false;
      setEditingOpen(false);
    }
  }, [editing]);
  const [viewId, setViewId] = useState(selected.id ?? selected.src ?? "0");

  useEffect(() => {
    setViewId(selected.id ?? selected.src ?? "0");
  }, [selected.id, selected.src]);

  const current =
    group.attempts.find((row) => (row.id ?? row.src ?? "0") === viewId) ?? selected;
  const attemptNo = Math.max(1, group.attempts.findIndex((row) => row === current) + 1);
  const total = group.attempts.length;
  const src = srcOf(current);
  const focus = layout ? locatorFocusForView(layout, current.viewId, current.roomName) : null;
  const isChosen = current.selected !== false && current.id === selected.id;
  const issues = current.auditIssues?.filter(Boolean) ?? [];
  const [checked, setChecked] = useState<string[]>(issues);
  const issueKey = issues.join("\n");

  useEffect(() => {
    setChecked(issues);
    // Reset selection when the still's issue list changes (rescan / new attempt).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- issueKey encodes issues
  }, [current.id, issueKey]);

  const originKey =
    current.origin === "edit"
      ? "workspaceWidgets.floorplanViz.originEdit"
      : current.origin === "cad"
        ? "workspaceWidgets.floorplanViz.originCad"
        : "workspaceWidgets.floorplanViz.originGenerate";

  const go = (delta: number) => {
    const idx = group.attempts.indexOf(current);
    const next = group.attempts[(idx + delta + group.attempts.length) % group.attempts.length];
    if (next) setViewId(next.id ?? next.src ?? "0");
  };

  const toggleIssue = (issue: string) => {
    setChecked((prev) => (prev.includes(issue) ? prev.filter((row) => row !== issue) : [...prev, issue]));
  };

  return (
    <figure className="overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-neutral-950">
      <div className="relative">
        <button
          type="button"
          className="block w-full cursor-zoom-in"
          onClick={() => onOpen(current)}
          aria-label={`${t("workspaceWidgets.floorplanViz.clickToZoom")}: ${current.labelHe}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={current.labelHe} className="h-72 w-full object-contain" />
        </button>
        {planSrc && focus ? (
          <div className="pointer-events-none absolute bottom-2 start-2">
            <PlanLocatorMap planSrc={planSrc} focus={focus} t={t} inset />
          </div>
        ) : null}
        {total > 1 ? (
          <>
            <button
              type="button"
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-1.5 text-white hover:bg-black/75"
              aria-label={t("workspaceWidgets.floorplanViz.prevAttempt")}
              onClick={() => go(-1)}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-1.5 text-white hover:bg-black/75"
              aria-label={t("workspaceWidgets.floorplanViz.nextAttempt")}
              onClick={() => go(1)}
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ) : null}
      </div>
      {planSrc && focus ? <PlanLocatorMap planSrc={planSrc} focus={focus} t={t} /> : null}
      <figcaption className="space-y-2 bg-[color:var(--background-main)] px-3 py-2 text-[11px] font-semibold">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">{current.labelHe}</span>
          <span className="flex shrink-0 items-center gap-1">
            <a
              href={src}
              download={fileNameOf(current, globalIndex)}
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-300"
            >
              <Download size={12} aria-hidden />
              {t("projectDashboard.vizDownload")}
            </a>
            {canManage && onDelete ? (
              <OsIconButton
                label={t("workspaceWidgets.floorplanViz.deleteImage")}
                size="sm"
                disabled={editing}
                onClick={() => onDelete(current)}
              >
                <Trash2 size={12} />
              </OsIconButton>
            ) : null}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-normal text-[color:var(--foreground-muted)]">
          <span>
            {t("workspaceWidgets.floorplanViz.attemptOf", {
              current: String(attemptNo),
              total: String(total),
            })}
          </span>
          <span>· {t(originKey)}</span>
          {isChosen ? (
            <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 dark:text-violet-200">
              {t("workspaceWidgets.floorplanViz.chosenAttempt")}
            </span>
          ) : canManage && onSelect && current.id ? (
            <OsButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={editing}
              icon={<Check size={12} aria-hidden />}
              onClick={() => onSelect(current)}
            >
              {t("workspaceWidgets.floorplanViz.chooseAttempt")}
            </OsButton>
          ) : null}
        </span>
        {issues.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[10px] font-normal text-amber-950 dark:text-amber-100">
            <p className="mb-1 font-semibold">
              {label(
                t("workspaceWidgets.floorplanViz.auditIssuesTitle"),
                "workspaceWidgets.floorplanViz.auditIssuesTitle",
                "מה צריך לתקן",
              )}
            </p>
            <p className="mb-1.5 text-[9px] text-amber-900/80 dark:text-amber-100/80">
              {label(
                t("workspaceWidgets.floorplanViz.auditIssuesPick"),
                "workspaceWidgets.floorplanViz.auditIssuesPick",
                "סמנו מה לתקן — אפשר לבטל פריטים שהביקורת טעתה בהם",
              )}
            </p>
            <ul className="space-y-1">
              {issues.map((issue) => {
                const id = `issue-${current.id ?? "x"}-${issue.slice(0, 24)}`;
                const on = checked.includes(issue);
                return (
                  <li key={issue} className="flex items-start gap-2">
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-0.5"
                      checked={on}
                      disabled={editing}
                      onChange={() => toggleIssue(issue)}
                    />
                    <label htmlFor={id} className="cursor-pointer leading-snug">
                      {hebrewFloorplanAuditIssue(issue)}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : canManage && onRescan ? (
          <p className="text-[10px] font-normal text-[color:var(--foreground-muted)]">
            {label(
              t("workspaceWidgets.floorplanViz.auditIssuesEmpty"),
              "workspaceWidgets.floorplanViz.auditIssuesEmpty",
              "אין ליקויים שמורים — אפשר לסרוק מול התוכנית",
            )}
          </p>
        ) : null}
        <span className="flex flex-wrap items-center gap-1.5">
          {canManage && onRescan ? (
            <OsButton
              type="button"
              variant="secondary"
              size="sm"
              loading={editing}
              disabled={editing}
              icon={<ScanSearch size={12} aria-hidden />}
              onClick={() => onRescan(current)}
            >
              {label(
                t("workspaceWidgets.floorplanViz.rescanImage"),
                "workspaceWidgets.floorplanViz.rescanImage",
                "סרוק מול תוכנית",
              )}
            </OsButton>
          ) : null}
          {canManage && onImprove ? (
            <OsButton
              type="button"
              variant="secondary"
              size="sm"
              loading={editing}
              disabled={editing || (issues.length > 0 && checked.length === 0)}
              icon={<Sparkles size={12} aria-hidden />}
              onClick={() => onImprove(current, issues.length ? checked : [])}
            >
              {label(
                t("workspaceWidgets.floorplanViz.improveImage"),
                "workspaceWidgets.floorplanViz.improveImage",
                "שפר תמונה",
              )}
            </OsButton>
          ) : null}
          {canManage && onEdit ? (
            <OsButton
              type="button"
              variant="secondary"
              size="sm"
              loading={editing}
              disabled={editing}
              icon={<Pencil size={12} aria-hidden />}
              onClick={() => setEditingOpen(true)}
            >
              {t("workspaceWidgets.floorplanViz.editImage")}
            </OsButton>
          ) : null}
        </span>
        {editingOpen && onEdit ? (
          <FloorplanVizEditMark
            t={t}
            image={current}
            busy={editing}
            onClose={() => {
              if (!editing) setEditingOpen(false);
            }}
            onSubmit={(instruction, region) => {
              submittedEdit.current = true;
              onEdit(current, instruction, region);
            }}
          />
        ) : null}
      </figcaption>
    </figure>
  );
}
