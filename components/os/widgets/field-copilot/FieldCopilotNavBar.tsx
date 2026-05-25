"use client";

import { useI18n } from "@/components/os/system/I18nProvider";

type Props = {
  showBack: boolean;
  showContinue: boolean;
  continueDisabled?: boolean;
  continueLabel?: string;
  onBack?: () => void;
  onContinue?: () => void;
};

export default function FieldCopilotNavBar({
  showBack,
  showContinue,
  continueDisabled = false,
  continueLabel,
  onBack,
  onContinue,
}: Props) {
  const { t } = useI18n();

  if (!showBack && !showContinue) return null;

  return (
    <div
      className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--border-main)] px-3 py-2"
      data-testid="field-copilot-nav"
    >
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold"
        >
          {t("workspaceWidgets.fieldCopilot.navBack")}
        </button>
      ) : (
        <span className="min-h-[44px] min-w-[4rem]" aria-hidden />
      )}
      {showContinue ? (
        <button
          type="button"
          data-testid="field-copilot-continue"
          disabled={continueDisabled}
          onClick={onContinue}
          className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 md:max-w-[240px] md:flex-none"
        >
          {continueLabel ?? t("workspaceWidgets.fieldCopilot.navContinue")}
        </button>
      ) : null}
    </div>
  );
}
