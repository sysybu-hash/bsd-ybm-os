"use client";

import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { WidgetType } from "@/hooks/use-window-manager";
import { buildDayQueryParams, readJewishCalendarPrefs } from "@/lib/jewish-calendar/prefs";
import type { DaySnapshot } from "@/lib/jewish-calendar/types";

const ISRAEL_TZ = "Asia/Jerusalem";

type Props = {
  openWidget?: (type: WidgetType) => void;
};

export default function JewishClockHeaderChip({ openWidget }: Props) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [hebrewLine, setHebrewLine] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = buildDayQueryParams(readJewishCalendarPrefs());
        const res = await fetch(`/api/jewish-calendar/day?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as DaySnapshot;
        if (!cancelled) setHebrewLine(json.hebrew.displayHe);
      } catch {
        /* optional chip */
      }
    }
    void load();
    const onPrefs = () => void load();
    window.addEventListener("jewish-calendar:prefs-changed", onPrefs);
    return () => {
      cancelled = true;
      window.removeEventListener("jewish-calendar:prefs-changed", onPrefs);
    };
  }, []);

  if (!mounted || !openWidget) return null;

  const timeStr = now.toLocaleTimeString("he-IL", {
    timeZone: ISRAEL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <button
      type="button"
      onClick={() => openWidget("jewishCalendar")}
      className="hidden min-w-0 max-w-[9.5rem] flex-col items-start rounded-lg border border-[color:var(--border-main)]/80 bg-[color:var(--surface-soft)]/80 px-2.5 py-1 text-start transition-colors hover:bg-[color:var(--surface-soft)] lg:flex"
      title={t("workspaceWidgets.jewishCalendar.openWidget")}
      aria-label={t("workspaceWidgets.jewishCalendar.openWidget")}
      dir="rtl"
    >
      <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums" suppressHydrationWarning>
        <Clock size={12} className="shrink-0 text-[color:var(--win-accent,#6366f1)]" aria-hidden />
        {timeStr}
      </span>
      {hebrewLine ? (
        <span className="w-full truncate text-[10px] leading-tight text-[color:var(--foreground-muted)]">
          {hebrewLine}
        </span>
      ) : null}
    </button>
  );
}
