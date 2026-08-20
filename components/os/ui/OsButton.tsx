"use client";

import React from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "os-btn-primary",
  secondary: "os-btn-secondary",
  quiet: "quiet-button",
  danger: "os-btn-danger",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
};

type OsButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
};

/**
 * Shared OS action button — wraps the existing `.os-btn-primary` / `.os-btn-secondary`
 * / `.quiet-button` / `.os-btn-danger` CSS classes so every widget gets one
 * consistent primary/secondary/quiet/danger button instead of hand-rolled Tailwind.
 * Accent inside windows follows `--win-accent` via `.os-btn-primary`'s CSS.
 */
export const OsButton = React.forwardRef<HTMLButtonElement, OsButtonProps>(function OsButton(
  { variant = "secondary", size = "md", icon, loading, disabled, className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`.trim()}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
