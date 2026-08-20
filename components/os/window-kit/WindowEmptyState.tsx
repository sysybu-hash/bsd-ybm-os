"use client";

import React from "react";

type WindowEmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Window Content Kit — מצב-ריק מזמין עם אריח-אייקון בגוון אקצנט החלון.
 * מחליף "אין מידע" יבש בהזמנה לפעולה. מסתגל לבהיר/כהה דרך --win-accent.
 */
export function WindowEmptyState({ icon, title, description, action, className = "" }: WindowEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`.trim()}>
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-[color:var(--win-accent,var(--accent))]"
        style={{ background: "color-mix(in srgb, var(--win-accent, var(--accent)) 14%, transparent)" }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="text-[15px] font-bold text-[color:var(--foreground-main)]">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-[color:var(--foreground-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
