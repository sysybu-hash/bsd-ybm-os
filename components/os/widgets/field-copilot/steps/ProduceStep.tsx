"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotHandoffTarget } from "@/lib/field-copilot/handoff";
import ProduceActions from "../ProduceActions";

type Props = {
  busy: boolean;
  onHandoff: (target: FieldCopilotHandoffTarget) => void;
};

export default function ProduceStep({ busy, onHandoff }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4">
      <div>
        <h3 className="text-base font-black">{t("workspaceWidgets.fieldCopilot.produceTitle")}</h3>
        <p className="text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.fieldCopilot.produceSubtitle")}
        </p>
      </div>

      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        {t("workspaceWidgets.fieldCopilot.disclaimer")}
      </p>

      <ProduceActions busy={busy} onHandoff={onHandoff} />
    </div>
  );
}
