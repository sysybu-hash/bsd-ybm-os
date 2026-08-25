"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveApiErrorMessage } from "@/lib/client/parse-json-response";
import type { BoqOption, ProgressBillPortalRow, ProjectOption } from "./types";

type Options = {
  t: (key: string, vars?: Record<string, string>) => string;
};

/**
 * The three fetches behind the progress-bill portal — bills, projects, and the
 * BOQ lines for whichever project is selected — split out of
 * ProgressBillPortalPanel so the component is left with the form and the table.
 *
 * Selecting a project resets the executed-quantity map, which is why `selected`
 * lives here alongside `boqLines` rather than with the rest of the form state:
 * the two are written together on every BOQ load.
 */
export function useProgressBillPortalData({ t }: Options) {
  const [bills, setBills] = useState<ProgressBillPortalRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [boqLines, setBoqLines] = useState<BoqOption[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/progress-bills", { credentials: "include" });
      const data = (await res.json()) as { bills?: ProgressBillPortalRow[]; error?: string };
      if (!res.ok) {
        throw new Error(
          resolveApiErrorMessage(data, t, t("workspaceWidgets.progressBills.loadError")),
        );
      }
      setBills(Array.isArray(data.bills) ? data.bills : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.progressBills.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      const data = (await res.json()) as { projects?: ProjectOption[] };
      const list = Array.isArray(data.projects) ? data.projects : [];
      setProjects(list);
      setProjectId((current) => current || list[0]?.id || "");
    } catch {
      setProjects([]);
    }
  }, []);

  const loadBoq = useCallback(async (pid: string) => {
    if (!pid) {
      setBoqLines([]);
      setSelected({});
      return;
    }
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/boq`, {
        credentials: "include",
      });
      const data = (await res.json()) as { lines?: BoqOption[] };
      const lines = Array.isArray(data.lines) ? data.lines : [];
      setBoqLines(lines);
      const next: Record<string, string> = {};
      for (const l of lines) {
        if (l.quantity != null) next[l.id] = String(l.quantity);
      }
      setSelected(next);
    } catch {
      setBoqLines([]);
      setSelected({});
    }
  }, []);

  useEffect(() => {
    void loadBills();
    void loadProjects();
  }, [loadBills, loadProjects]);

  useEffect(() => {
    void loadBoq(projectId);
  }, [projectId, loadBoq]);

  return {
    bills,
    projects,
    boqLines,
    selected,
    setSelected,
    projectId,
    setProjectId,
    loading,
    error,
    setError,
    reloadBills: loadBills,
  };
}
