"use client";

import { FileText, ListChecks, ScrollText } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotHandoffTarget } from "@/lib/field-copilot/handoff";

type Props = {
  busy: boolean;
  onHandoff: (target: FieldCopilotHandoffTarget) => void;
};

export default function ProduceActions({ busy, onHandoff }: Props) {
  const { t } = useI18n();

  const buttons: { target: FieldCopilotHandoffTarget; icon: typeof FileText; label: string }[] = [
    { target: "QUOTE", icon: FileText, label: t("workspaceWidgets.fieldCopilot.produceQuote") },
    { target: "BOQ", icon: ListChecks, label: t("workspaceWidgets.fieldCopilot.produceBoq") },
    { target: "ORDER_AGREEMENT", icon: ScrollText, label: t("workspaceWidgets.fieldCopilot.produceContract") },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-1">
      {buttons.map(({ target, icon: Icon, label }) => (
        <button
          key={target}
          type="button"
          disabled={busy}
          onClick={() => onHandoff(target)}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-slate-800 font-bold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
        >
          <Icon size={20} />
          {label}
        </button>
      ))}
    </div>
  );
}
