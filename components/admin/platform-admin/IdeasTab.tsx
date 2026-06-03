"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Globe, Loader2, RefreshCw, XCircle } from "lucide-react";
import {
  listAppIdeasAction,
  updateAppIdeaStatusAction,
  promoteIdeaToGlobalTemplateAction,
  type AppIdeaItem,
} from "@/app/actions/app-ideas";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  approved: "מאושר",
  rejected: "נדחה",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  approved: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  rejected: "text-rose-500 bg-rose-500/10 border-rose-500/30",
};

export function IdeasTab() {
  const [ideas, setIdeas] = useState<AppIdeaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listAppIdeasAction(filter === "all" ? undefined : filter);
      if (res.ok) {
        setIdeas(res.ideas);
      } else {
        setLoadError(res.error ?? "טעינת הרעיונות נכשלה");
        setIdeas([]);
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "שגיאה בטעינת רעיונות");
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const handleStatus = async (id: string, status: "pending" | "approved" | "rejected") => {
    setBusy(id);
    try {
      await updateAppIdeaStatusAction(id, status);
      setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    } finally {
      setBusy(null);
    }
  };

  const handlePromote = async (id: string) => {
    setBusy(id);
    try {
      const res = await promoteIdeaToGlobalTemplateAction(id);
      if (res.ok) {
        setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status: "approved" } : i)));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-black">מאגר רעיונות מהקהילה</h2>
          <p className="text-xs text-[color:var(--foreground-muted)]">
            רעיונות שמנויים בחרו לשתף — ללא נתוני ארגון/משתמש
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)] disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          רענן
        </button>
      </div>

      {/* Filter tabs */}
      <nav className="flex gap-1 border-b border-[color:var(--border-main)] pb-2">
        {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filter === f
                ? "bg-blue-600 text-white"
                : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
            }`}
          >
            {f === "all" ? "הכל" : STATUS_LABELS[f]}
          </button>
        ))}
      </nav>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[color:var(--foreground-muted)]">
          <Loader2 size={16} className="animate-spin" /> טוען רעיונות…
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
          {loadError}
        </div>
      ) : ideas.length === 0 ? (
        <p className="py-8 text-center text-sm text-[color:var(--foreground-muted)]">
          אין רעיונות {filter !== "all" ? `בסטטוס "${STATUS_LABELS[filter]}"` : ""} כרגע
        </p>
      ) : (
        <ul className="space-y-2">
          {ideas.map((idea) => {
            const isBusy = busy === idea.id;
            const isExpanded = expanded === idea.id;
            return (
              <li
                key={idea.id}
                className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[color:var(--foreground-main)]">{idea.appName}</span>
                      <span className="rounded bg-[color:var(--surface-soft)] px-1.5 py-0.5 text-[10px] text-[color:var(--foreground-muted)]">
                        {idea.appType}
                      </span>
                      {idea.orgIndustry ? (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                          {idea.orgIndustry}
                        </span>
                      ) : null}
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_COLORS[idea.status] ?? ""}`}>
                        {STATUS_LABELS[idea.status] ?? idea.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[color:var(--foreground-muted)]">
                      {new Date(idea.createdAt).toLocaleString("he-IL")}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : idea.id)}
                      className="rounded-lg border border-[color:var(--border-main)] px-2.5 py-1.5 text-[11px] font-bold hover:bg-[color:var(--surface-soft)]"
                    >
                      {isExpanded ? "סגור" : "JSON"}
                    </button>
                    {idea.status !== "approved" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatus(idea.id, "approved")}
                        className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-400 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                        אשר
                      </button>
                    )}
                    {idea.status !== "rejected" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatus(idea.id, "rejected")}
                        className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-400 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                        דחה
                      </button>
                    )}
                    {idea.status === "approved" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handlePromote(idea.id)}
                        className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-bold text-blue-400 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
                        קדם לתבנית גלובלית
                      </button>
                    )}
                  </div>
                </div>

                {/* JSON preview */}
                {isExpanded && (
                  <pre className="custom-scrollbar mt-3 max-h-48 overflow-auto rounded-lg bg-[color:var(--surface-soft)] p-2 text-[10px] leading-relaxed text-[color:var(--foreground-muted)]">
                    {JSON.stringify(idea.uiSchema, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
