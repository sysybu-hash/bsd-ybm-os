"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

type ThemeToggleProps = {
  className?: string;
  variant?: "default" | "landing";
};

export default function ThemeToggle({ className = "", variant = "default" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span
        className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg ${className}`}
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");

  const variantClass =
    variant === "landing"
      ? "flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-muted)] backdrop-blur-md transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
      : "quiet-button flex min-h-11 min-w-11 items-center justify-center p-0 text-[color:var(--foreground-muted)]";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`${variantClass} ${className}`.trim()}
      title="שינוי ערכת נושא"
      aria-label={isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
    >
      {isDark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
    </button>
  );
}
