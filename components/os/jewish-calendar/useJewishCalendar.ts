"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DaySnapshot } from "@/lib/jewish-calendar/types";
import { useJewishCalendarLocation } from "./useJewishCalendarLocation";

const ISRAEL_TZ = "Asia/Jerusalem";

function israelDateIso(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function shiftDateIso(iso: string, deltaDays: number): string {
  const parts = iso.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return israelDateIso(dt);
}

export function useJewishCalendar() {
  const { ready: locReady, geoDenied, locationLabel, setCity, useMyLocation, queryParams } =
    useJewishCalendarLocation();
  const [viewDate, setViewDate] = useState(() => israelDateIso());
  const [data, setData] = useState<DaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fetchDay = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = queryParams(viewDate);
      const res = await fetch(`/api/jewish-calendar/day?${params.toString()}`);
      if (!res.ok) throw new Error("fetch_failed");
      const json = (await res.json()) as DaySnapshot;
      setData(json);
    } catch {
      setError("fetch_failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryParams, viewDate]);

  useEffect(() => {
    if (!locReady) return;
    void fetchDay();
  }, [locReady, fetchDay]);

  useEffect(() => {
    const onPrefs = () => void fetchDay();
    window.addEventListener("jewish-calendar:prefs-changed", onPrefs);
    return () => window.removeEventListener("jewish-calendar:prefs-changed", onPrefs);
  }, [fetchDay]);

  const isToday = viewDate === israelDateIso();

  const clockDisplay = useMemo(
    () =>
      now.toLocaleTimeString("he-IL", {
        timeZone: ISRAEL_TZ,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [now],
  );

  const nextZman = useMemo(() => {
    if (!data || !isToday || !data.nextZmanId) return null;
    return data.zmanim.find((z) => z.id === data.nextZmanId) ?? null;
  }, [data, isToday]);

  const minutesUntilNext = useMemo(() => {
    if (!nextZman) return null;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: ISRAEL_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const nowMin = h * 60 + m;
    return nextZman.minutesFromMidnight - nowMin;
  }, [nextZman, now]);

  const goToday = useCallback(() => setViewDate(israelDateIso()), []);
  const goPrev = useCallback(() => setViewDate((d) => shiftDateIso(d, -1)), []);
  const goNext = useCallback(() => setViewDate((d) => shiftDateIso(d, 1)), []);

  const formatZmanTime = useCallback((iso: string) => {
    return new Date(iso).toLocaleTimeString("he-IL", {
      timeZone: ISRAEL_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, []);

  return {
    locReady,
    geoDenied,
    locationLabel,
    setCity,
    useMyLocation,
    viewDate,
    isToday,
    data,
    loading,
    error,
    clockDisplay,
    nextZman,
    minutesUntilNext,
    goToday,
    goPrev,
    goNext,
    refresh: fetchDay,
    formatZmanTime,
    nowMinutes: (() => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: ISRAEL_TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
      const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
      return h * 60 + m;
    })(),
  };
}
