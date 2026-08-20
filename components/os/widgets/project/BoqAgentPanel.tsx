"use client";

import React, { useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { OsButton } from "@/components/os/ui";

type Suggestion = {
  action: "add" | "update" | "note";
  lineId?: string;
  description: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  rationale?: string;
};

type AgentResponse = {
  summary: string;
  suggestions: Suggestion[];
};

export default function BoqAgentPanel({
  apiBase,
  onApplied,
}: {
  apiBase: string;
  onApplied: () => void;
}) {
  const { t } = useI18n();

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const runAgent = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/boq/agent`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const json = (await res.json()) as AgentResponse & { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? t("projectDashboard.boqAgentError"));
        return;
      }
      setResult(json);
      setSelected(new Set(json.suggestions.map((_, i) => i)));
    } catch {
      toast.error(t("projectDashboard.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const applySelected = async () => {
    if (!result) return;
    const suggestions = result.suggestions.filter((_, i) => selected.has(i));
    if (suggestions.length === 0) {
      toast.error(t("projectDashboard.boqAgentPickOne"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/boq/agent`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, suggestions }),
      });
      const json = (await res.json()) as { applied?: number; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? t("projectDashboard.boqAgentApplyError"));
        return;
      }
      toast.success(t("projectDashboard.boqAgentApplied", { count: String(json.applied ?? 0) }));
      setResult(null);
      setPrompt("");
      onApplied();
    } catch {
      toast.error(t("projectDashboard.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });
  };

  return (
    <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-200">
        <Sparkles size={14} />
        {t("projectDashboard.boqAgentTitle")}
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        dir="auto"
        placeholder={t("projectDashboard.boqAgentPlaceholder")}
        className="w-full resize-none rounded-lg border border-[color:var(--border-main)] bg-transparent px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/40"
      />
      <OsButton
        variant="primary"
        className="w-full justify-center bg-violet-600 hover:bg-violet-500"
        disabled={prompt.trim().length < 3}
        loading={loading && !result}
        icon={<Sparkles size={14} aria-hidden />}
        onClick={() => void runAgent()}
      >
        {t(loading && !result ? "projectDashboard.boqAgentAnalyzing" : "projectDashboard.boqAgentSuggest")}
      </OsButton>

      {result ? (
        <div className="space-y-2 text-xs">
          <p className="text-[color:var(--foreground-muted)]">{result.summary}</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {result.suggestions.map((s, i) => (
              <li key={i}>
                <label className="flex cursor-pointer gap-2 rounded-lg border border-[color:var(--border-main)] p-2">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-bold text-violet-700 dark:text-violet-300">
                      {t(s.action === "add" ? "projectDashboard.actionAdd" : s.action === "update" ? "projectDashboard.actionUpdate" : "projectDashboard.actionNote")}:
                    </span>{" "}
                    {s.description}
                    {s.rationale ? (
                      <span className="block text-[10px] text-[color:var(--foreground-muted)]">
                        {s.rationale}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <OsButton
            variant="primary"
            className="w-full justify-center bg-emerald-600 hover:bg-emerald-500"
            loading={loading}
            onClick={() => void applySelected()}
          >
            {t("projectDashboard.boqAgentApplySelected")}
          </OsButton>
        </div>
      ) : null}
    </div>
  );
}
