"use client";

import { RefreshCw } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { JewishZmanimTimeline } from "@/components/os/jewish-calendar/JewishZmanimTimeline";
import { LocationCombobox } from "@/components/os/jewish-calendar/LocationCombobox";
import { useJewishCalendar } from "@/components/os/jewish-calendar/useJewishCalendar";

const S = "workspaceWidgets.jewishCalendar";
const R = "workspaceWidgets.utilityRail.zmanim";

type Props = {
  onOpenFullWidget: () => void;
};

export default function ZmanimUtilityPanel({ onOpenFullWidget }: Props) {
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
    locale === "he" || locale === "ar" ? data.gregorian.weekdayHe : data.gregorian.weekdayEn;
  const gregDisplay =
    locale === "he" || locale === "ar" ? data.gregorian.displayHe : data.gregorian.displayEn;
  const zmanLabel = (z: { labelHe: string; labelEn: string }) =>
    locale === "en" || locale === "ru" ? z.labelEn : z.labelHe;

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
    <div className="flex flex-col gap-3" dir={layoutDir}>
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

      <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3">
        <p className="font-mono text-2xl font-bold tabular-nums" suppressHydrationWarning>
          {isToday ? clockDisplay : "—"}
        </p>
        <p className="mt-1 text-sm font-medium">{weekday}</p>
        <p className="text-sm font-semibold">{data.hebrew.displayHe}</p>
        <p className="text-xs text-[color:var(--foreground-muted)]">{gregDisplay}</p>
      </div>

      {isToday && nextZman && minutesUntilNext != null && minutesUntilNext > 0 ? (
        <p className="rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-200">
          {t(`${S}.nextZman`, {
            name: zmanLabel(nextZman),
            minutes: String(minutesUntilNext),
          })}
        </p>
      ) : null}

      <JewishZmanimTimeline
        zmanim={data.zmanim}
        nowMinutes={nowMinutes}
        nextZmanId={data.nextZmanId}
        isToday={isToday}
      />

      <div className="max-h-48 overflow-y-auto rounded-xl border border-[color:var(--border-main)]">
        <table className="w-full text-sm">
          <tbody>
            {data.zmanim.map((z) => {
              const isNext = isToday && z.id === data.nextZmanId;
              return (
                <tr
                  key={z.id}
                  className={`border-b border-[color:var(--border-main)]/60 last:border-0 ${
                    isNext ? "bg-indigo-500/10" : ""
                  }`}
                >
                  <td className="px-2 py-1.5">{zmanLabel(z)}</td>
                  <td className="px-2 py-1.5 text-end font-mono tabular-nums text-[color:var(--foreground-muted)]">
                    {formatZmanTime(z.at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-xs font-semibold hover:bg-[color:var(--surface-soft)]"
        >
          <RefreshCw size={14} aria-hidden />
          {t(`${S}.refresh`)}
        </button>
        <button
          type="button"
          onClick={onOpenFullWidget}
          className="rounded-lg bg-[color:var(--win-accent,#6366f1)] px-3 py-1.5 text-xs font-bold text-white"
        >
          {t(`${R}.openFullWidget`)}
        </button>
      </div>
    </div>
  );
}
