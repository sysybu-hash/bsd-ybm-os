"use client";

import * as React from "react";

/**
 * The classic dashboard is intentionally always-bright. We drop the global `.dark`
 * class from <html> while the dashboard is mounted so the embedded OS widgets (which
 * carry `dark:` variants) render their light design coherently. The previous theme is
 * restored on unmount, so the OS workspace keeps its dark theme.
 */
function ForceLightTheme() {
  React.useLayoutEffect(() => {
    const el = document.documentElement;
    const hadDark = el.classList.contains("dark");
    el.classList.remove("dark");
    el.classList.add("light");
    const prevScheme = el.style.colorScheme;
    el.style.colorScheme = "light";
    return () => {
      if (hadDark) {
        el.classList.add("dark");
        el.classList.remove("light");
      }
      el.style.colorScheme = prevScheme;
    };
  }, []);
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
