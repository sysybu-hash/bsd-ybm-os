"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMeckanoAccess } from "@/hooks/use-meckano-access";
import { osFieldClassName } from "@/components/os/ui/os-field";
import { OsButton } from "@/components/os/ui";
import type { DashboardData } from "./types";
import { formatDate } from "./utils";

type DiaryTabProps = {
  data: DashboardData;
  apiBase: string;
  refresh: () => Promise<void>;
  t: (key: string) => string;
  /** Pre-filled description when navigating here from Gantt */
  initialDesc?: string;
  /** Pre-linked task ID when navigating here from Gantt */
  initialTaskId?: string | null;
};

export function DiaryTab({
  data,
  apiBase,
  refresh,
  t,
  initialDesc,
  initialTaskId,
}: DiaryTabProps) {

  const { allowed: meckanoAllowed } = useMeckanoAccess();
  const [desc, setDesc] = useState(initialDesc ?? "");
  const [linkTaskId, setLinkTaskId] = useState<string | null>(initialTaskId ?? null);
  const [workers, setWorkers] = useState("1");
  const [progress, setProgress] = useState("0");

  // Sync when parent navigates here with pre-filled values. Adjusted during
  // render so the fields are already populated on the first paint of the tab.
  const [lastInitialDesc, setLastInitialDesc] = useState(initialDesc);
  if (initialDesc !== lastInitialDesc) {
    setLastInitialDesc(initialDesc);
    if (initialDesc) setDesc(initialDesc);
  }

  const [lastInitialTaskId, setLastInitialTaskId] = useState(initialTaskId);
  if (initialTaskId !== lastInitialTaskId) {
    setLastInitialTaskId(initialTaskId);
    if (initialTaskId !== undefined) setLinkTaskId(initialTaskId ?? null);
  }

  return (
    <div className="space-y-4">
      {meckanoAllowed ? (
        <OsButton
          variant="secondary"
          size="sm"
          onClick={async () => {
            const res = await fetch(`${apiBase}/sync-meckano`, {
              method: "POST",
              credentials: "include",
            });
            const json = await res.json();
            if (!res.ok) {
              toast.error(json.error ?? t("workspaceWidgets.projectDashboard.meckanoSyncFailed"));
              return;
            }
            toast.success(t("workspaceWidgets.projectDashboard.meckanoSyncDone").replace("{c}", String(json.created)).replace("{u}", String(json.updated)));
            await refresh();
          }}
        >
          {t("projectDashboard.diarySyncMeckano")}
        </OsButton>
      ) : null}

      <form
        className="space-y-2 rounded-lg border border-[color:var(--border-main)] p-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!desc.trim()) return;
          await fetch(`${apiBase}/work-diaries`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: desc,
              workersCount: Number(workers) || 1,
              progress: Number(progress) || 0,
              isSyncedToAI: true,
              linkedTaskId: linkTaskId ?? undefined,
            }),
          });
          setDesc("");
          setLinkTaskId(null);
          toast.success(t("projectDashboard.diarySaved"));
          await refresh();
        }}
      >
        <textarea
          className={`${osFieldClassName} min-h-[72px]`}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t("projectDashboard.diaryPlaceholder")}
        />
        <div className="flex flex-wrap gap-2">
          <input
            className={osFieldClassName}
            type="number"
            min={1}
            value={workers}
            onChange={(e) => setWorkers(e.target.value)}
            aria-label={t("projectDashboard.workers")}
          />
          <input
            className={osFieldClassName}
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
            aria-label={t("projectDashboard.progress")}
          />
          <OsButton type="submit" variant="primary" size="sm" className="bg-emerald-600 hover:bg-emerald-500">
            {t("projectDashboard.saveDiary")}
          </OsButton>
        </div>
      </form>

      {/* Attendance logs */}
      <section>
        <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.attendanceTitle")}</h3>
        {(data.attendanceLogs ?? []).length === 0 ? (
          <p className="text-xs text-[color:var(--foreground-muted)]">
            {t("projectDashboard.attendanceEmpty")}
          </p>
        ) : (
          <ul className="mb-4 space-y-1 text-xs">
            {(data.attendanceLogs ?? []).map((log, idx) => (
              <li
                key={log.id ?? idx}
                className="flex justify-between rounded border border-[color:var(--border-main)] px-2 py-1"
              >
                <span>
                  {log.employeeName ?? "—"} · {log.status ?? ""}
                </span>
                <span>
                  {log.date ? formatDate(log.date) : "—"} · {log.hours ?? 0}h
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Work diaries list */}
      <ul className="space-y-2 text-xs">
        {data.workDiaries.map((d) => (
          <li key={d.id} className="rounded-lg border border-[color:var(--border-main)] p-2">
            <p className="font-medium">{formatDate(d.date)}</p>
            <p className="text-[color:var(--foreground-muted)]">{d.description}</p>
            <p>
              {t("projectDashboard.workers")}: {d.workersCount} · {d.progress}%
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
