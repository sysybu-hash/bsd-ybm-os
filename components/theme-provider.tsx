"use client";

import * as React from "react";

type ThemeName = "light" | "dark" | "system";

export type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: string | string[];
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
  forcedTheme?: string;
};

type ThemeContextValue = {
  theme?: string;
  setTheme: (theme: string) => void;
  resolvedTheme?: string;
  themes: string[];
  systemTheme?: "dark" | "light";
  forcedTheme?: string;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === "light" || value === "dark" || value === "system";
}

function readSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(theme: string, enableSystem: boolean, systemTheme: "dark" | "light"): "light" | "dark" {
  if (theme === "system" && enableSystem) return systemTheme;
  return theme === "light" ? "light" : "dark";
}

function applyThemeClass(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove(resolved === "light" ? "dark" : "light");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

/**
 * Theme context without an inline <script>.
 * FOUC is handled by ROOT_THEME_AND_BOOT in app/layout.tsx <head>.
 * next-themes cannot be used here: React 19 warns on <script> inside client components.
 */
export function ThemeProvider({
  children,
  defaultTheme = "dark",
  enableSystem = true,
  disableTransitionOnChange = false,
  storageKey = "theme",
  forcedTheme,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState(defaultTheme);
  const [systemTheme, setSystemTheme] = React.useState<"dark" | "light">("dark");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let stored = defaultTheme;
    try {
      const raw = localStorage.getItem(storageKey);
      if (isThemeName(raw)) stored = raw;
    } catch {
      /* private mode */
    }
    setThemeState(stored);
    const system = readSystemTheme();
    setSystemTheme(system);
    applyThemeClass(resolveTheme(forcedTheme ?? stored, enableSystem, system));
    setReady(true);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setSystemTheme(readSystemTheme());
    mq.addEventListener("change", onScheme);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !isThemeName(event.newValue)) return;
      setThemeState(event.newValue);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mq.removeEventListener("change", onScheme);
      window.removeEventListener("storage", onStorage);
    };
  }, [defaultTheme, enableSystem, forcedTheme, storageKey]);

  React.useEffect(() => {
    if (!ready) return;
    const resolved = resolveTheme(forcedTheme ?? theme, enableSystem, systemTheme);
    if (disableTransitionOnChange) {
      const style = document.createElement("style");
      style.appendChild(
        document.createTextNode("*,*::before,*::after{transition:none!important}"),
      );
      document.head.appendChild(style);
      applyThemeClass(resolved);
      window.getComputedStyle(document.body);
      document.head.removeChild(style);
      return;
    }
    applyThemeClass(resolved);
  }, [disableTransitionOnChange, enableSystem, forcedTheme, ready, systemTheme, theme]);

  const setTheme = React.useCallback(
    (next: string) => {
      setThemeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* private mode */
      }
    },
    [storageKey],
  );

  const resolvedTheme = resolveTheme(forcedTheme ?? theme, enableSystem, systemTheme);
  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      themes: enableSystem ? ["light", "dark", "system"] : ["light", "dark"],
      systemTheme,
      forcedTheme,
    }),
    [enableSystem, forcedTheme, resolvedTheme, setTheme, systemTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return (
    React.useContext(ThemeContext) ?? {
      setTheme: () => {},
      themes: [],
    }
  );
}
