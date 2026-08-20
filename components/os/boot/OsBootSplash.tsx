"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useI18n } from "@/components/os/system/I18nProvider";
import { BRAND_LOGO_ALT, BRAND_LOGO_DAY_SRC, BRAND_LOGO_NIGHT_SRC, BRAND_WORDMARK } from "@/lib/brand";

const BOOT = "workspaceWidgets.boot";

export type OsBootPhase = "chunk" | "session" | "desktop" | "ready" | "register";

type OsBootSplashProps = {
  phase?: OsBootPhase;
  /** Fade out before unmount */
  fading?: boolean;
  className?: string;
};

const PHASE_KEY: Record<OsBootPhase, string> = {
  chunk: "phaseChunk",
  session: "phaseSession",
  desktop: "phaseDesktop",
  ready: "phaseReady",
  register: "phaseRegister",
};

/** Keep in sync with useOsBootGate hide timeout */
export const OS_BOOT_MIN_MS = 700;
export const OS_BOOT_FADE_MS = 500;

/**
 * Boot splash matched to the desktop theme background so dismiss is a soft
 * content fade — not a dark→light full-screen jump.
 */
export default function OsBootSplash({
  phase = "session",
  fading = false,
  className = "",
}: OsBootSplashProps) {
  const { t, dir } = useI18n();
  const [tick, setTick] = useState(0);
  const [logoSrc, setLogoSrc] = useState(BRAND_LOGO_NIGHT_SRC);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 2200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setLogoSrc(dark ? BRAND_LOGO_NIGHT_SRC : BRAND_LOGO_DAY_SRC);
  }, []);

  const rotatingKeys = ["hintStart", "hintDesktop", "hintAlmost"] as const;
  const hint = t(`${BOOT}.${rotatingKeys[tick % rotatingKeys.length]}`);
  const status = t(`${BOOT}.${PHASE_KEY[phase]}`);

  return (
    <div
      className={`fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-[color:var(--background-main)] text-[color:var(--foreground-main)] ${
        fading ? "pointer-events-none" : ""
      } ${className}`}
      dir={dir}
      role="status"
      aria-live="polite"
      aria-busy={!fading}
    >
      <div
        className={`relative z-10 flex flex-col items-center px-6 text-center transition-opacity duration-500 ease-out ${
          fading || phase === "ready" ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-sm">
          <Image
            src={logoSrc}
            alt={BRAND_LOGO_ALT}
            width={64}
            height={64}
            className="object-contain"
            priority
            unoptimized
          />
        </div>

        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.35em] text-[color:var(--foreground-muted)]">
          {BRAND_WORDMARK}
        </p>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{t(`${BOOT}.title`)}</h1>
        <p className="mt-3 min-h-[1.25rem] text-sm text-[color:var(--foreground-muted)]">{status}</p>
        <p className="mt-1 min-h-[1.25rem] text-xs text-[color:var(--foreground-muted)] opacity-80">
          {hint}
        </p>

        <div
          className="relative mt-10 h-1 w-48 overflow-hidden rounded-full bg-[color:var(--border-main)] sm:w-56"
          aria-hidden
        >
          <div className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-[color:var(--win-accent,#6366f1)] to-transparent opacity-90 [animation:os-boot-slide_1.5s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}
