"use client";

import React from "react";

type WindowSectionProps = {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * Window Content Kit — סקשן תוכן עם כותרת ומרווח אחיד.
 * חלק משפת התוכן המשותפת; יורש את אקצנט החלון דרך --win-accent בצאצאים.
 */
export function WindowSection({ title, action, children, className = "" }: WindowSectionProps) {
  return (
    <section className={`space-y-3 ${className}`.trim()}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h3 className="text-[12px] font-black uppercase tracking-wide text-[color:var(--foreground-muted)]">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
