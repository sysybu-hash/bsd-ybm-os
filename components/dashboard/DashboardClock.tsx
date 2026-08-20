"use client";

import React from "react";
import { Clock } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

const LOCALE_TAG: Record<string, string> = { he: "he-IL", en: "en-US", ru: "ru-RU" };

/** Live header clock — time (HH:MM:SS) + localized date. */
export default function DashboardClock() {
  const { locale } = useI18n();
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tag = LOCALE_TAG[locale] ?? "he-IL";
  const time = now
    ? now.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
  const date = now
    ? now.toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" })
    : "";

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-1.5 shadow-sm">
      <Clock size={16} className="text-[color:var(--accent)]" aria-hidden />
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-sm font-bold tabular-nums text-[color:var(--foreground-main)]">{time}</span>
        {date ? <span className="text-[10px] text-[color:var(--foreground-muted)]">{date}</span> : null}
      </div>
    </div>
  );
}
