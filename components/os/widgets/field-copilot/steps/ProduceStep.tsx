"use client";

import { Pencil } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotHandoffTarget } from "@/lib/field-copilot/handoff";
import ProduceActions from "../ProduceActions";

type Props = {
  busy: boolean;
  onHandoff: (target: FieldCopilotHandoffTarget) => void;
  isHandedOff?: boolean;
  onReopen?: () => void;
};

export default function ProduceStep({ busy, onHandoff, isHandedOff, onReopen }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4">
      <div>
        <h3 className="text-base font-black">{t("workspaceWidgets.fieldCopilot.produceTitle")}</h3>
        <p className="text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.fieldCopilot.produceSubtitle")}
        </p>
      </div>

      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        {t("workspaceWidgets.fieldCopilot.disclaimer")}
      </p>

      {isHandedOff && onReopen ? (
        <button
          type="button"
          onClick={onReopen}
          className="flex items-center justify-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-500/20 dark:text-indigo-300"
        >
          <Pencil size={15} />
          {t("workspaceWidgets.fieldCopilot.reopenSession")}
        </button>
      ) : null}

      <ProduceActions busy={busy} onHandoff={onHandoff} />
    </div>
  );
}
