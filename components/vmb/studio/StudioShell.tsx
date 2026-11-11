"use client";

import Image from "next/image";
import { useSyncExternalStore, type ReactNode } from "react";
import { Check, Coins, Moon, Sun } from "lucide-react";
import { VmbLink } from "@/components/vmb/VmbLink";
import { VmbMark } from "@/components/vmb/VmbWordmark";

export type ShellLabels = {
  projects: string;
  account: string;
  credits: string;
  creditsValue: string;
  projectName: string;
  projectMeta: string;
  steps: string[];
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

/** The working app: graphite by default, full light mode, 7-step rail always visible. */
export function StudioShell({
  labels,
  current,
  account,
  children,
}: {
  labels: ShellLabels;
  current: number;
  /** The signed-in user's chip (AccountMenu), rendered at the end of the top bar. */
  account?: ReactNode;
  children: ReactNode;
}) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, (): Theme => "dark");
  const toggle = () => writeTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="vmb min-h-screen" data-theme={theme} dir="rtl" lang="he">
      <header className="sticky top-0 z-30 border-b border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          <VmbLink href="/" aria-label="home">
            <VmbMark />
          </VmbLink>
          <nav className="flex items-center gap-1 text-sm">
            <span className="rounded-full bg-[color:var(--vmb-bg-sunk)] px-3 py-1.5 font-semibold">{labels.projects}</span>
            <span className="rounded-full px-3 py-1.5 text-[color:var(--vmb-muted)]">{labels.account}</span>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-[color:var(--vmb-line)] px-3 py-1.5 text-xs">
              <Coins className="h-3.5 w-3.5 text-[color:var(--vmb-accent)]" aria-hidden />
              <span className="text-[color:var(--vmb-muted)]">{labels.credits}</span>
              <span className="vmb-mono font-semibold">{labels.creditsValue}</span>
            </span>
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
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="relative overflow-hidden rounded-[var(--vmb-radius)] text-white">
          <Image src="/floorplan-viz/styles/jerusalem_stone.jpg" alt="" fill sizes="100vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-l from-black/85 via-black/60 to-black/20" />
          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            <h1 className="vmb-display text-3xl font-extrabold sm:text-5xl">{labels.projectName}</h1>
            <p className="mt-2 text-sm text-white/65">{labels.projectMeta}</p>
          </div>
        </div>
        <ol className="mt-6 flex gap-1 overflow-x-auto pb-1" aria-label="steps">
          {labels.steps.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li
                key={s}
                aria-current={active ? "step" : undefined}
                className={`flex min-w-[112px] flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                  active
                    ? "border-[color:var(--vmb-accent)] bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-ink)]"
                    : done
                      ? "border-[color:var(--vmb-line)] text-[color:var(--vmb-ink-soft)]"
                      : "border-dashed border-[color:var(--vmb-line)] text-[color:var(--vmb-muted)]"
                }`}
              >
                <span
                  className={`vmb-mono grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                    done ? "bg-[color:var(--vmb-pass)] text-[color:var(--vmb-bg)]" : active ? "bg-[color:var(--vmb-accent)] text-[color:var(--vmb-accent-ink)]" : "border border-[color:var(--vmb-line-strong)]"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
                </span>
                {s}
              </li>
            );
          })}
        </ol>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
