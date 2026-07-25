"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import { OsButton } from "@/components/os/ui";

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
        <OsButton variant="secondary" className="min-h-[44px]" onClick={onBack}>
          {t("workspaceWidgets.fieldCopilot.navBack")}
        </OsButton>
      ) : (
        <span className="min-h-[44px] min-w-[4rem]" aria-hidden />
      )}
      {showContinue ? (
        <OsButton
          variant="primary"
          data-testid="field-copilot-continue"
          className="min-h-[44px] flex-1 justify-center bg-amber-600 hover:bg-amber-500 md:max-w-[240px] md:flex-none"
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {continueLabel ?? t("workspaceWidgets.fieldCopilot.navContinue")}
        </OsButton>
      ) : null}
    </div>
  );
}
