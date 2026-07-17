"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useI18n } from "@/components/os/system/I18nProvider";
import { BRAND_LOGO_ALT, BRAND_LOGO_NIGHT_SRC, BRAND_WORDMARK } from "@/lib/brand";

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
export const OS_BOOT_MIN_MS = 900;
export const OS_BOOT_FADE_MS = 750;

/**
 * Windows-style full-screen boot splash until the OS shell is ready.
 * Crossfades to the desktop (lightens then fades) to avoid a hard jump.
 */
export default function OsBootSplash({
  phase = "session",
  fading = false,
  className = "",
}: OsBootSplashProps) {
  const { t, dir } = useI18n();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 2200);
    return () => window.clearInterval(id);
  }, []);

  const rotatingKeys = ["hintStart", "hintDesktop", "hintAlmost"] as const;
  const hint = t(`${BOOT}.${rotatingKeys[tick % rotatingKeys.length]}`);
  const status = t(`${BOOT}.${PHASE_KEY[phase]}`);
  const blending = fading || phase === "ready";

  return (
    <div
      className={`fixed inset-0 z-[3000] flex flex-col items-center justify-center transition-[opacity,background-color,color] duration-700 ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      } ${
        blending
          ? "bg-[color:var(--background-main)] text-[color:var(--foreground-muted)]"
          : "bg-[#0b1220] text-slate-100"
      } ${className}`}
      dir={dir}
      role="status"
      aria-live="polite"
      aria-busy={!fading}
    >
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          blending ? "opacity-0" : "opacity-40"
        }`}
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(56,189,248,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 70% 80%, rgba(99,102,241,0.12), transparent 50%)",
        }}
        aria-hidden
      />

      <div
        className={`relative z-10 flex flex-col items-center px-6 text-center transition-opacity duration-500 ${
          blending ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-sky-900/40">
          <Image
            src={BRAND_LOGO_NIGHT_SRC}
            alt={BRAND_LOGO_ALT}
            width={64}
            height={64}
            className="object-contain"
            priority
            unoptimized
          />
        </div>

        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400">
          {BRAND_WORDMARK}
        </p>
        <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          {t(`${BOOT}.title`)}
        </h1>
        <p className="mt-3 min-h-[1.25rem] text-sm text-slate-300">{status}</p>
        <p className="mt-1 min-h-[1.25rem] text-xs text-slate-500">{hint}</p>

        <div
          className="relative mt-10 h-1 w-48 overflow-hidden rounded-full bg-white/10 sm:w-56"
          aria-hidden
        >
          <div className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-sky-400 to-transparent opacity-90 [animation:os-boot-slide_1.5s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}
