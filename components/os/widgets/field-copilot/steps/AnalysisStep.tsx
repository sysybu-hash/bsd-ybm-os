"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";

const PROGRESS_COUNT = 4;

type Props = {
  loading: boolean;
  onAnalyze: () => void;
  scopeSummary?: string | null;
};

export default function AnalysisStep({ loading, onAnalyze, scopeSummary }: Props) {
  const { t } = useI18n();
  const [progressIdx, setProgressIdx] = useState(0);

  useEffect(() => {
    if (!loading) { setProgressIdx(0); return; }
    const id = setInterval(() => setProgressIdx((i) => (i + 1) % PROGRESS_COUNT), 5_000);
    return () => clearInterval(id);
  }, [loading]);

  return (
    <div className="flex flex-col gap-4 p-4">
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
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[color:var(--win-accent,#6366f1)] font-bold text-white disabled:opacity-50"
      >
        {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
        {loading
          ? t(`workspaceWidgets.fieldCopilot.analysisProgress${progressIdx}` as Parameters<typeof t>[0])
          : t("workspaceWidgets.fieldCopilot.analyzeCta")}
      </button>

      {scopeSummary ? (
        <p className="rounded-xl bg-[color:var(--surface-soft)] p-4 text-sm whitespace-pre-wrap">{scopeSummary}</p>
      ) : null}

    </div>
  );
}
