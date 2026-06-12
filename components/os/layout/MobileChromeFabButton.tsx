"use client";

import type { LucideIcon } from "lucide-react";

type Props = Readonly<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  testId?: string;
  variant?: "neutral" | "accent";
  /**
   * "fab" — כפתור עגול קומפקטי (ברירת מחדל).
   * "tab" — לשונית מלבנית הצמודה לקצה התפריט, עם עקומה רק בפינה הפנימית העליונה.
   */
  shape?: "fab" | "tab";
  /** לשונית tab: לאיזה קצה היא צמודה — קובע את צד העקומה הפנימית. */
  corner?: "start" | "end";
}>;

/** כפתור FAB / לשונית קצה לסרגל מובייל — מינימום 44px למגע, ללא מראה "מנופח" */
export default function MobileChromeFabButton({
  icon: Icon,
  label,
  onClick,
  testId,
  variant = "neutral",
  shape = "fab",
  corner = "start",
}: Props) {
  const accent = variant === "accent";

  const palette = accent
    ? "border-indigo-400/35 bg-indigo-600 text-white hover:bg-indigo-500"
    : "border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 text-indigo-600 hover:bg-[color:var(--surface-soft)] dark:text-indigo-400";

  if (shape === "tab") {
    // קצה חיצוני שטוח צמוד לגבול המסך, תחתית שטוחה שמתמזגת עם ה-dock,
    // ועקומה רק בפינה הפנימית העליונה (start → top-end, end → top-start).
    const innerRadius = corner === "start" ? "rounded-se-2xl" : "rounded-ss-2xl";
    return (
      <button
        type="button"
        data-testid={testId}
        aria-label={label}
        title={label}
        onClick={onClick}
        className={`mobile-chrome-tab-btn flex h-8 min-h-[32px] shrink-0 touch-manipulation items-center gap-1.5 border border-b-0 px-3 backdrop-blur-md transition active:scale-95 ${innerRadius} ${palette}`}
      >
        <Icon size={16} strokeWidth={2} aria-hidden />
        <span className="text-[10px] font-bold leading-none">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`mobile-chrome-fab-btn flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-xl border shadow-sm backdrop-blur-md transition active:scale-95 ${palette}`}
    >
      <Icon size={18} strokeWidth={2} aria-hidden />
    </button>
  );
}
