import {
  CandleLightingEvent,
  GeoLocation,
  getSedra,
  HavdalahEvent,
  HebrewCalendar,
  Location,
  Zmanim,
} from "@hebcal/core";
import { formatGregorianDisplay, formatHebrewDateDisplay, hebrewWeekday } from "./format-hebrew-date";
import { resolveLocationInput } from "./locations";
import type { DaySnapshot, JewishCalendarLocation, ZmanEntry } from "./types";
import { ZMANIM_DEFINITIONS } from "./zmanim-definitions";

const ISRAEL_TZ = "Asia/Jerusalem";

function toIsraelDateParts(date: Date): { y: number; m: number; d: number } {
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

function parseDateInput(dateStr?: string | null): Date {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split("-");
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  const now = new Date();
  const { y, m, d } = toIsraelDateParts(now);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function toHebcalLocation(loc: JewishCalendarLocation): Location {
  const builtIn = Location.lookup(loc.nameEn);
  if (builtIn && Math.abs(builtIn.getLatitude() - loc.lat) < 0.05) {
    return builtIn;
  }
  return new Location(
    loc.lat,
    loc.lng,
    true,
    loc.timezone,
    loc.nameEn,
    "IL",
    loc.id,
    loc.elevation,
  );
}

function minutesFromMidnightIsrael(dt: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function formatTimeIsrael(dt: Date): string {
  return dt.toLocaleTimeString("he-IL", {
    timeZone: ISRAEL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function computeZmanim(loc: JewishCalendarLocation, day: Date): ZmanEntry[] {
  const gloc = new GeoLocation(loc.nameEn, loc.lat, loc.lng, loc.elevation, loc.timezone);
  const zmanim = new Zmanim(gloc, day, loc.elevation > 0);
  const entries: ZmanEntry[] = [];

  for (const def of ZMANIM_DEFINITIONS) {
    const at = def.compute(zmanim);
    if (!at || Number.isNaN(at.getTime())) continue;
    const rounded = Zmanim.roundTime(at);
    entries.push({
      id: def.id,
      labelHe: def.labelHe,
      labelEn: def.labelEn,
      at: Zmanim.formatISOWithTimeZone(loc.timezone, rounded),
      minutesFromMidnight: minutesFromMidnightIsrael(rounded),
    });
  }

  return entries.sort((a, b) => a.minutesFromMidnight - b.minutesFromMidnight);
}

function findNextZmanId(zmanim: ZmanEntry[], now: Date): string | null {
  const nowMin = minutesFromMidnightIsrael(now);
  const next = zmanim.find((z) => z.minutesFromMidnight > nowMin);
  return next?.id ?? null;
}

function computeParasha(day: Date, loc: JewishCalendarLocation): string | undefined {
  try {
    const gloc = new GeoLocation(loc.nameEn, loc.lat, loc.lng, loc.elevation, loc.timezone);
    const hd = Zmanim.makeSunsetAwareHDate(gloc, day, loc.elevation > 0);
    const sedra = getSedra(hd.getFullYear(), true);
    const result = sedra.lookup(hd);
    if (result?.parsha?.length) {
      return result.parsha.join("-");
    }
  } catch {
    /* optional */
  }
  return undefined;
}

function computeShabbat(hebcalLoc: Location, day: Date, useElevation: boolean): DaySnapshot["shabbat"] | undefined {
  const start = new Date(day);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(day);
  end.setUTCDate(end.getUTCDate() + 7);

  const events = HebrewCalendar.calendar({
    start,
    end,
    location: hebcalLoc,
    candlelighting: true,
    il: true,
    sedrot: true,
    useElevation,
  });

  let candleLighting: string | undefined;
  let havdalah: string | undefined;
  let parasha: string | undefined;

  for (const ev of events) {
    if (ev instanceof CandleLightingEvent && !candleLighting) {
      candleLighting = ev.eventTimeStr;
    }
    if (ev instanceof HavdalahEvent && !havdalah) {
      havdalah = ev.eventTimeStr;
    }
    const desc = ev.render("he");
    if (desc.includes("פרשת") && !parasha) {
      parasha = desc.replace(/^פרשת\s*/, "");
    }
  }

  if (!candleLighting && !havdalah) return undefined;
  return {
    candleLighting: candleLighting ?? "",
    havdalah: havdalah ?? "",
    parasha,
  };
}

export type ComputeDayInput = {
  date?: string | null;
  locationId?: string | null;
  lat?: number | null;
  lng?: number | null;
  elevation?: number | null;
  now?: Date;
};

export function computeJewishCalendarDay(input: ComputeDayInput = {}): DaySnapshot {
  const day = parseDateInput(input.date);
  const location = resolveLocationInput(input);
  const hebcalLoc = toHebcalLocation(location);
  const now = input.now ?? new Date();

  const gloc = new GeoLocation(location.nameEn, location.lat, location.lng, location.elevation, location.timezone);
  const hd = Zmanim.makeSunsetAwareHDate(gloc, now, location.elevation > 0);
  const hebrew = formatHebrewDateDisplay(hd);
  const gregorian = formatGregorianDisplay(day);

  const zmanim = computeZmanim(location, day);
  const isToday = gregorian.iso === formatGregorianDisplay(now).iso;
  const nextZmanId = isToday ? findNextZmanId(zmanim, now) : null;

  const dayOfWeek = day.getUTCDay();
  const showShabbat = dayOfWeek === 5 || dayOfWeek === 6 || isToday && [4, 5, 6].includes(now.getDay());

  return {
    location: {
      id: location.id,
      nameHe: location.nameHe,
      nameEn: location.nameEn,
      lat: location.lat,
      lng: location.lng,
    },
    gregorian: {
      iso: gregorian.iso,
      weekdayHe: hebrewWeekday(day, "he"),
      weekdayEn: hebrewWeekday(day, "en"),
      displayHe: gregorian.displayHe,
      displayEn: gregorian.displayEn,
    },
    hebrew,
    parasha: computeParasha(day, location),
    clock: { timezone: ISRAEL_TZ },
    zmanim,
    nextZmanId,
    shabbat: showShabbat ? computeShabbat(hebcalLoc, day, location.elevation > 0) : undefined,
  };
}
