"use client";

import React from "react";
import type { ButtonHTMLAttributes } from "react";

interface TouchTargetProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Optional label shown below the icon/content */
  label?: string;
}

/**
 * A mobile-optimised tap target — min 44×44px (WCAG 2.5.5).
 * Replaces the repeated pattern:
 *   "flex min-h-[44px] w-full min-w-0 flex-col items-center justify-center"
 */
export function TouchTarget({ children, label, className = "", ...props }: TouchTargetProps) {
  return (
    <button
      type="button"
      className={`flex min-h-[44px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-0.5 transition-colors duration-150 active:scale-95 ${className}`}
      {...props}
    >
      {children}
      {label && (
        <span className="max-w-full truncate px-0.5 text-[9px] font-bold leading-tight text-foreground-muted">
          {label}
        </span>
      )}
    </button>
  );
}
