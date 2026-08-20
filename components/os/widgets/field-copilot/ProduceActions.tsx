"use client";

import { FileText, ListChecks, ScrollText } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { OsButton } from "@/components/os/ui";
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
        <OsButton
          key={target}
          variant="primary"
          className="min-h-[52px] justify-center"
          disabled={busy}
          icon={<Icon size={20} aria-hidden />}
          onClick={() => onHandoff(target)}
        >
          {label}
        </OsButton>
      ))}
    </div>
  );
}
