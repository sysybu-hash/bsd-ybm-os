/**
 * Israel (Asia/Jerusalem): Shabbat, Yom Tov, and Chol HaMoed rest windows.
 * Candle lighting → havdalah (Jerusalem), including Friday evening / Motzei Shabbat.
 */

import {
  CandleLightingEvent,
  flags,
  HDate,
  HavdalahEvent,
  HebrewCalendar,
  Location,
} from "@hebcal/core";

const ISRAEL_TZ = "Asia/Jerusalem";

/** שבת / חג / חול המועד */
const REST_FLAGS = flags.CHAG | flags.CHOL_HAMOED;

function jerusalemLocation(): Location {
  const loc = Location.lookup("Jerusalem");
  if (loc) return loc;
  return new Location(31.778, 35.235, true, ISRAEL_TZ, "Jerusalem", "IL", "IL-Jeru", 800);
}

function israelYmd(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value ?? 0),
    m: Number(parts.find((p) => p.type === "month")?.value ?? 1),
    d: Number(parts.find((p) => p.type === "day")?.value ?? 1),
  };
}

function isCalendarRestDay(hd: HDate): boolean {
  if (hd.getDay() === 6) return true; // Shabbat
  const events = HebrewCalendar.getHolidaysOnDate(hd, true) ?? [];
  return events.some((ev) => (ev.getFlags() & REST_FLAGS) !== 0);
}

/**
 * True when `now` falls in a Jewish rest window in Israel
 * (Shabbat / Yom Tov / Chol HaMoed), using Jerusalem candle lighting → havdalah.
 */
export function isJewishRestDay(now: Date = new Date()): boolean {
  const loc = jerusalemLocation();
  const { y, m, d } = israelYmd(now);
  const todayNoonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const hd = new HDate(todayNoonUtc);

  const start = new HDate(hd).prev().prev();
  const end = new HDate(hd).next().next();

  const events = HebrewCalendar.calendar({
    start,
    end,
    il: true,
    candlelighting: true,
    location: loc,
    sedrot: false,
    omer: false,
    noMinorFast: true,
    noModern: true,
    noRoshChodesh: true,
  });

  let lastCandle: Date | null = null;
  for (const ev of events) {
    if (ev instanceof CandleLightingEvent) {
      const t = ev.eventTime;
      if (t && t.getTime() <= now.getTime()) {
        if (!lastCandle || t.getTime() > lastCandle.getTime()) lastCandle = t;
      }
    }
  }

  if (lastCandle) {
    let nextHavdalah: Date | null = null;
    for (const ev of events) {
      if (ev instanceof HavdalahEvent) {
        const t = ev.eventTime;
        if (t && t.getTime() > lastCandle.getTime()) {
          if (!nextHavdalah || t.getTime() < nextHavdalah.getTime()) nextHavdalah = t;
        }
      }
    }
    if (nextHavdalah && now.getTime() < nextHavdalah.getTime()) {
      return true;
    }
  }

  // Daytime Shabbat / chag / chol hamoed (between candle windows)
  return isCalendarRestDay(hd);
}

export function jewishRestDayReason(now: Date = new Date()): string | null {
  if (!isJewishRestDay(now)) return null;
  const { y, m, d } = israelYmd(now);
  const hd = new HDate(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
  if (hd.getDay() === 6) return "shabbat";
  const events = HebrewCalendar.getHolidaysOnDate(hd, true) ?? [];
  if (events.some((ev) => (ev.getFlags() & flags.CHAG) !== 0)) return "chag";
  if (events.some((ev) => (ev.getFlags() & flags.CHOL_HAMOED) !== 0)) return "chol_hamoed";
  return "rest";
}
