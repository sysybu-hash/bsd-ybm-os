"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Coins, Moon, Sun } from "lucide-react";
import { VmbLink } from "@/components/vmb/VmbLink";
import { VmbMark, VmbWordmark } from "@/components/vmb/VmbWordmark";

export type FrameLabels = {
  projects: string;
  account: string;
  credits: string;
  themeLight: string;
  themeDark: string;
};

const THEME_KEY = "vmb-theme";

type Theme = "light" | "dark";
const themeListeners = new Set<() => void>();
// Fallback when storage is blocked: the toggle still works for this page view.
let memoryTheme: Theme = "dark";

function readTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return memoryTheme;
  }
}

function writeTheme(next: Theme) {
  memoryTheme = next;
  try {
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode: theme just isn't remembered */
  }
  themeListeners.forEach((l) => l());
}

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

const tab = (on: boolean) =>
  `rounded-full px-3 py-1.5 ${on ? "bg-[color:var(--vmb-bg-sunk)] font-semibold" : "text-[color:var(--vmb-muted)] hover:text-[color:var(--vmb-ink)]"}`;

/** The working app's frame: top bar (projects, account, credits, theme, user) over graphite or light. */
export function StudioFrame({
  labels,
  active,
  credits,
  account,
  children,
}: {
  labels: FrameLabels;
  active: "projects" | "account";
  /** The office's credit balance; null hides the chip. */
  credits: number | null;
  /** The signed-in user's chip (AccountMenu). */
  account?: ReactNode;
  children: ReactNode;
}) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, (): Theme => "dark");
  const toggle = () => writeTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="vmb min-h-screen" data-theme={theme} dir="rtl" lang="he">
      <header className="sticky top-0 z-30 border-b border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
          <VmbLink href="/" aria-label="home" className="shrink-0">
            <VmbMark className="h-8 w-auto sm:hidden" />
            <span className="hidden sm:block">
              <VmbWordmark className="h-8 w-auto" />
            </span>
          </VmbLink>
          <nav className="flex items-center gap-1 text-sm">
            <VmbLink href="/app" className={tab(active === "projects")} aria-current={active === "projects" ? "page" : undefined}>
              {labels.projects}
            </VmbLink>
            <VmbLink href="/account" className={tab(active === "account")} aria-current={active === "account" ? "page" : undefined}>
              {labels.account}
            </VmbLink>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            {credits !== null ? (
              <VmbLink
                href="/account"
                className="hidden items-center gap-1.5 rounded-full border border-[color:var(--vmb-line)] px-3 py-1.5 text-xs hover:border-[color:var(--vmb-line-strong)] sm:flex"
              >
                <Coins className="h-3.5 w-3.5 text-[color:var(--vmb-accent)]" aria-hidden />
                <span className="text-[color:var(--vmb-muted)]">{labels.credits}</span>
                <span className="vmb-mono font-semibold">{credits.toLocaleString("en-US")}</span>
              </VmbLink>
            ) : null}
            <button
              type="button"
              onClick={toggle}
              className="rounded-full p-2 hover:bg-[color:var(--vmb-bg-sunk)]"
              aria-label={theme === "dark" ? labels.themeLight : labels.themeDark}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {account}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1400px] px-4 py-6">{children}</div>
    </div>
  );
}
