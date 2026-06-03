"use client";

import React from "react";
import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ElementType;
  /** Required for accessibility — rendered as aria-label */
  ariaLabel: string;
  /** Size preset. Defaults to "md" (36×36px, meets WCAG 2.5.5 enhanced) */
  size?: "sm" | "md" | "lg";
  /** Visual style variant */
  variant?: "default" | "danger" | "active";
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
} as const;

const iconSizeClasses = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
} as const;

const variantClasses = {
  default: "text-foreground-muted hover:bg-surface-soft hover:text-foreground-main",
  danger:  "text-foreground-muted hover:bg-red-500/10 hover:text-rose-600 dark:hover:text-rose-400",
  active:  "bg-surface-soft text-foreground-main",
} as const;

export function IconButton({
  icon: Icon,
  ariaLabel,
  size = "md",
  variant = "default",
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`
        flex shrink-0 items-center justify-center rounded-lg
        transition-colors duration-150
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `.trim().replace(/\s+/g, " ")}
      {...props}
    >
      <Icon className={iconSizeClasses[size]} aria-hidden />
    </button>
  );
}
