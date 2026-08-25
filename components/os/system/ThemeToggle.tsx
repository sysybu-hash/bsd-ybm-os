"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useIsMounted } from "@/hooks/use-is-mounted";

type ThemeToggleProps = {
  className?: string;
  variant?: "default" | "landing" | "toolbar";
};

export default function ThemeToggle({ className = "", variant = "default" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const mounted = useIsMounted();

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
      : variant === "toolbar"
        ? "flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
        : "quiet-button flex min-h-11 min-w-11 items-center justify-center p-0 text-[color:var(--foreground-muted)]";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`${variantClass} ${className}`.trim()}
      title={t("workspaceShell.header.themeToggleTitle")}
      aria-label={
        isDark
          ? t("workspaceShell.header.themeToLight")
          : t("workspaceShell.header.themeToDark")
      }
    >
      {isDark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
    </button>
  );
}
