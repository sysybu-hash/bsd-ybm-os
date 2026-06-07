"use client";

import type { LucideIcon } from "lucide-react";

type Props = Readonly<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  testId?: string;
  variant?: "neutral" | "accent";
}>;

/** כפתור FAB קומפקטי לסרגל מובייל — מינימום 44px למגע, ללא מראה "מנופח" */
export default function MobileChromeFabButton({
  icon: Icon,
  label,
  onClick,
  testId,
  variant = "neutral",
}: Props) {
  const accent = variant === "accent";

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`mobile-chrome-fab-btn flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-xl border backdrop-blur-md transition active:scale-95 ${
        accent
          ? "border-indigo-400/35 bg-indigo-600 text-white shadow-sm hover:bg-indigo-500"
          : "border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 text-indigo-600 shadow-sm hover:bg-[color:var(--surface-soft)] dark:text-indigo-400"
      }`}
    >
      <Icon size={18} strokeWidth={2} aria-hidden />
    </button>
  );
}
