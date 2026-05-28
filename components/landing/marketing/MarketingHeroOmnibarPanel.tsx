"use client";

import Link from "next/link";
import type { MarketingChatMessage } from "@/hooks/useMarketingHeroOmnibar";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  messages: readonly MarketingChatMessage[];
  sessionEnded: boolean;
  registerHref: string;
  lastTranscript?: string;
  voiceActive: boolean;
}>;

export default function MarketingHeroOmnibarPanel({
  messages,
  sessionEnded,
  registerHref,
  lastTranscript,
  voiceActive,
}: Props) {
  const { t, dir } = useI18n();

  return (
    <div className="mkt-glass mt-3 w-full max-w-2xl rounded-2xl border border-white/10 p-4" dir={dir}>
      <ul className="max-h-56 space-y-3 overflow-y-auto pe-1 text-sm" aria-live="polite">
        {messages.map((msg) => (
          <li
            key={msg.id}
            className={`rounded-xl px-3 py-2 leading-relaxed ${
              msg.role === "user"
                ? "ms-8 bg-slate-900/50 text-slate-100"
                : "me-8 border border-emerald-500/20 bg-emerald-950/30 text-slate-200"
            }`}
          >
            {msg.content}
          </li>
        ))}
      </ul>

      {voiceActive && lastTranscript?.trim() ? (
        <p className="mt-3 text-center text-xs text-slate-400">{lastTranscript}</p>
      ) : null}

      {sessionEnded ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <p className="text-sm font-bold text-amber-100">
            {t("marketingHome.cinematic.omnibarSessionEndedTitle")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            {t("marketingHome.cinematic.omnibarSessionEndedHint")}
          </p>
          <Link
            href={registerHref}
            className="mkt-btn-primary mt-4 inline-flex rounded-xl px-6 py-2.5 text-sm font-bold"
          >
            {t("marketingHome.cinematic.omnibarJoinCta")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
