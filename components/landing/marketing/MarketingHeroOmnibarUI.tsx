"use client";

import { Loader2, Mic, Send, Sparkles, Volume2 } from "lucide-react";
import Link from "next/link";
import MarketingHeroOmnibarPanel from "@/components/landing/marketing/MarketingHeroOmnibarPanel";
import type { MarketingHeroOmnibarState } from "@/hooks/useMarketingHeroOmnibar";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  omnibar: MarketingHeroOmnibarState;
  /** מצב מגירה מובייל — ללא ריווח תחתון מיותר */
  variant?: "hero" | "sheet";
}>;

export default function MarketingHeroOmnibarUI({ omnibar, variant = "hero" }: Props) {
  const { t, dir } = useI18n();
  const shellActive = omnibar.voiceActive;
  const showHint = variant === "hero" && !omnibar.showPanel;
  const inputId =
    variant === "sheet" ? "marketing-mobile-omnibar-input" : "marketing-hero-omnibar-input";

  return (
    <div className="w-full max-w-2xl" dir={dir}>
      <form
        className={`mkt-omnibar-glow mkt-glass flex w-full flex-col gap-2 rounded-2xl p-3 sm:p-4 ${
          shellActive ? "ring-2 ring-blue-500/35" : ""
        }`}
        onSubmit={(e) => {
          e.preventDefault();
          void omnibar.sendMessage();
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="mkt-omnibar-icon h-5 w-5 shrink-0" aria-hidden />
          <p className="mkt-omnibar-label text-[10px] font-bold uppercase tracking-widest">
            {t("marketingHome.cinematic.omnibarLabel")}
          </p>
          <div className="mkt-omnibar-badge ms-auto flex items-center gap-1.5 rounded-md border border-white/10 bg-slate-950/40 px-2 py-1">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                shellActive
                  ? "animate-pulse bg-blue-400"
                  : omnibar.isBusy
                    ? "animate-pulse bg-amber-400"
                    : "bg-blue-500"
              }`}
              aria-hidden
            />
            <span className="mkt-omnibar-status max-w-[9rem] truncate text-[10px] font-semibold sm:max-w-none">
              {omnibar.statusLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={inputId}>
            {t("marketingHome.cinematic.omnibarInputLabel")}
          </label>
          <input
            id={inputId}
            type="text"
            value={omnibar.input}
            onChange={(e) => omnibar.setInput(e.target.value)}
            disabled={omnibar.voiceActive || omnibar.isBusy}
            placeholder={
              omnibar.voiceActive
                ? t("marketingHome.cinematic.omnibarPlaceholderVoice")
                : t("marketingHome.cinematic.omnibarPlaceholder")
            }
            className="mkt-omnibar-field mkt-omnibar-typed min-h-[44px] flex-1 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm font-semibold outline-none ring-0 placeholder:text-slate-500 focus:border-blue-500/45 disabled:opacity-60"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              omnibar.toggleLive();
            }}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
              shellActive
                ? "bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                : "mkt-omnibar-mic-idle border border-white/15 bg-slate-950/40 text-slate-300 hover:border-blue-500/45 hover:text-blue-300"
            }`}
            title={
              shellActive
                ? t("marketingHome.cinematic.omnibarVoiceOff")
                : t("marketingHome.cinematic.omnibarVoiceOn")
            }
            aria-label={
              shellActive
                ? t("marketingHome.cinematic.omnibarVoiceOff")
                : t("marketingHome.cinematic.omnibarVoiceOn")
            }
            aria-pressed={shellActive}
          >
            {omnibar.voiceStatus === "connecting" ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : omnibar.voiceStatus === "speaking" ? (
              <Volume2 className="h-5 w-5" aria-hidden />
            ) : (
              <Mic className="h-5 w-5" aria-hidden />
            )}
          </button>
          <button
            type="submit"
            disabled={omnibar.voiceActive || omnibar.isBusy || !omnibar.input.trim()}
            className="mkt-btn-primary flex h-11 shrink-0 items-center justify-center gap-1 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
            aria-label={t("marketingHome.cinematic.omnibarSendAria")}
          >
            <Send className="h-4 w-4 rtl:rotate-180" aria-hidden />
            <span className="hidden sm:inline">{t("marketingHome.cinematic.omnibarSend")}</span>
          </button>
        </div>
      </form>

      {omnibar.showPanel ? (
        <MarketingHeroOmnibarPanel
          messages={omnibar.messages}
          sessionEnded={omnibar.sessionEnded}
          registerHref={omnibar.registerHref}
          lastTranscript={omnibar.lastTranscript}
          voiceActive={omnibar.voiceActive}
          onClear={omnibar.clearChat}
        />
      ) : showHint ? (
        <p className="mkt-omnibar-hint mt-2 text-center text-xs text-slate-500">
          {t("marketingHome.cinematic.omnibarHint")}{" "}
          <Link
            href={omnibar.registerHref}
            className="font-semibold text-amber-300/90 underline-offset-2 hover:underline"
          >
            {t("marketingHome.cinematic.omnibarJoinCta")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
