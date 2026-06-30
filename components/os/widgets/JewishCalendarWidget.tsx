"use client";

import React from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WindowBody from "@/components/os/layout/WindowBody";
import WidgetState from "@/components/os/WidgetState";
import { JewishZmanimTimeline } from "@/components/os/jewish-calendar/JewishZmanimTimeline";
import { LocationCombobox } from "@/components/os/jewish-calendar/LocationCombobox";
import { useJewishCalendar } from "@/components/os/jewish-calendar/useJewishCalendar";

const S = "workspaceWidgets.jewishCalendar";

export default function JewishCalendarWidget() {
  const { t, dir, locale } = useI18n();
  const layoutDir: "rtl" | "ltr" = dir === "rtl" ? "rtl" : "ltr";
  const {
    locReady,
    locationHint,
    suggestLocationPicker,
    locationLabel,
    setCity,
    useMyLocation,
    dismissLocationHint,
    data,
    loading,
    error,
    clockDisplay,
    nextZman,
    minutesUntilNext,
    isToday,
    goToday,
    goPrev,
    goNext,
    refresh,
    formatZmanTime,
    nowMinutes,
  } = useJewishCalendar();

  const locName =
    data?.location?.nameHe ??
    (locale === "en" ? data?.location?.nameEn : undefined) ??
    locationLabel;

  if (!locReady || (loading && !data)) {
    return <WidgetState variant="loading" message={t(`${S}.loading`)} />;
  }

  if (error && !data) {
    return (
      <WidgetState
        variant="error"
        message={t(`${S}.loadFailed`)}
        onRetry={() => void refresh()}
        retryLabel={t(`${S}.retry`)}
      />
    );
  }

  if (!data) {
    return <WidgetState variant="loading" message={t(`${S}.loading`)} />;
  }

  const weekday =
    locale === "he" || locale === "ar"
      ? data.gregorian.weekdayHe
      : data.gregorian.weekdayEn;
  const gregDisplay =
    locale === "he" || locale === "ar"
      ? data.gregorian.displayHe
      : data.gregorian.displayEn;

  const locationHintMessage =
    locationHint === "choose-city"
      ? t(`${S}.chooseCityHint`)
      : locationHint === "denied"
        ? t(`${S}.geoDenied`)
        : locationHint === "timeout"
          ? t(`${S}.geoTimeout`)
          : locationHint === "unavailable"
            ? t(`${S}.geoUnavailable`)
            : locationHint === "unsupported"
              ? t(`${S}.geoUnsupported`)
              : null;

  return (
    <WindowBody className="gap-3 p-3 sm:p-4" dir={layoutDir}>
      <div className="flex flex-wrap items-center gap-2">
        <LocationCombobox
          label={locName}
          useMyLocationLabel={t(`${S}.useMyLocation`)}
          dir={layoutDir}
          onSelect={setCity}
          onUseMyLocation={useMyLocation}
          defaultOpen={suggestLocationPicker}
          emphasize={Boolean(suggestLocationPicker && locationHintMessage)}
          hint={locationHintMessage}
          onDismissHint={dismissLocationHint}
        />
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-[color:var(--border-main)] p-0.5">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-md p-1.5 hover:bg-[color:var(--surface-soft)]"
            aria-label={t(`${S}.prevDay`)}
          >
            <ChevronRight size={16} className={layoutDir === "rtl" ? "" : "rotate-180"} aria-hidden />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-2 py-1 text-xs font-semibold text-[color:var(--win-accent,#6366f1)] dark:text-indigo-300"
          >
            {t(`${S}.today`)}
          </button>
          <button
            type="button"
            onClick={goNext}
            className="rounded-md p-1.5 hover:bg-[color:var(--surface-soft)]"
            aria-label={t(`${S}.nextDay`)}
          >
            <ChevronLeft size={16} className={layoutDir === "rtl" ? "" : "rotate-180"} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-[color:var(--border-main)] p-1.5 hover:bg-[color:var(--surface-soft)]"
          title={t(`${S}.refresh`)}
          aria-label={t(`${S}.refresh`)}
        >
          <RefreshCw size={14} aria-hidden />
        </button>
      </div>

      <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums tracking-tight" suppressHydrationWarning>
              {isToday ? clockDisplay : "—"}
            </p>
            <p className="mt-1 text-sm font-medium text-[color:var(--foreground-main)]">{weekday}</p>
          </div>
          <div className="text-end text-sm">
            <p className="font-semibold text-[color:var(--foreground-main)]">{data.hebrew.displayHe}</p>
            <p className="text-[color:var(--foreground-muted)]">{gregDisplay}</p>
            {data.parasha ? (
              <p className="mt-1 text-xs text-[color:var(--win-accent,#6366f1)] dark:text-indigo-300">
                {t(`${S}.parasha`)} {data.parasha}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <JewishZmanimTimeline
        zmanim={data.zmanim}
        nowMinutes={nowMinutes}
        nextZmanId={data.nextZmanId}
        isToday={isToday}
      />

      {isToday && nextZman && minutesUntilNext != null && minutesUntilNext > 0 ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">
          {t(`${S}.nextZman`, {
            name: locale === "en" ? nextZman.labelEn : nextZman.labelHe,
            minutes: String(minutesUntilNext),
          })}
        </p>
      ) : null}

      <div className="rounded-xl border border-[color:var(--border-main)]">
        <table className="w-full text-sm">
          <tbody>
            {data.zmanim.map((z) => {
              const isNext = isToday && z.id === data.nextZmanId;
              const label = locale === "en" ? z.labelEn : z.labelHe;
              return (
                <tr
                  key={z.id}
                  className={`border-b border-[color:var(--border-main)]/60 last:border-0 ${
                    isNext ? "bg-indigo-500/10" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-[color:var(--foreground-main)]">{label}</td>
                  <td className="px-3 py-2 text-end font-mono tabular-nums text-[color:var(--foreground-muted)]">
                    {formatZmanTime(z.at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.shabbat && (data.shabbat.candleLighting || data.shabbat.havdalah) ? (
        <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/5 p-3 text-sm">
          <p className="font-semibold text-[color:var(--foreground-main)]">{t(`${S}.shabbatTitle`)}</p>
          {data.shabbat.candleLighting ? (
            <p className="mt-1 text-[color:var(--foreground-muted)]">
              {t(`${S}.candleLighting`)}: {data.shabbat.candleLighting}
            </p>
          ) : null}
          {data.shabbat.havdalah ? (
            <p className="text-[color:var(--foreground-muted)]">
              {t(`${S}.havdalah`)}: {data.shabbat.havdalah}
            </p>
          ) : null}
          {data.shabbat.parasha ? (
            <p className="text-[color:var(--foreground-muted)]">
              {t(`${S}.parasha`)} {data.shabbat.parasha}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-center text-[10px] text-[color:var(--foreground-muted)]">
        <a
          href="https://www.hebcal.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[color:var(--win-accent,#6366f1)]"
        >
          {t(`${S}.credit`)}
        </a>
      </p>
    </WindowBody>
  );
}
