"use client";

import React from "react";

type Size = "sm" | "md";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

type OsIconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required — icon-only buttons must have an accessible name. */
  label: string;
  size?: Size;
  active?: boolean;
};

/** Square icon-only button, wraps `.quiet-button` for consistent icon actions (refresh, view toggles). */
export const OsIconButton = React.forwardRef<HTMLButtonElement, OsIconButtonProps>(
  function OsIconButton({ label, size = "md", active = false, className = "", children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        aria-label={label}
        title={label}
        aria-pressed={rest["aria-pressed"] ?? (active || undefined)}
        className={`quiet-button ${SIZE_CLASS[size]} !min-h-0 !p-0 ${
          active ? "border-[color:var(--win-accent,var(--accent))] text-[color:var(--win-accent,var(--accent))]" : ""
        } ${className}`.trim()}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
