"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = {
  loading: boolean;
  onAnalyze: () => void;
  scopeSummary?: string | null;
};

export default function AnalysisStep({ loading, onAnalyze, scopeSummary }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h3 className="text-base font-black">{t("workspaceWidgets.fieldCopilot.analysisTitle")}</h3>
        <p className="text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.fieldCopilot.analysisSubtitle")}
        </p>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={onAnalyze}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-50"
      >
        {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
        {loading ? t("workspaceWidgets.fieldCopilot.analyzing") : t("workspaceWidgets.fieldCopilot.analyzeCta")}
      </button>

      {scopeSummary ? (
        <p className="rounded-xl bg-[color:var(--surface-soft)] p-4 text-sm whitespace-pre-wrap">{scopeSummary}</p>
      ) : null}

    </div>
  );
}
