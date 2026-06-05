import type { JewishCalendarPrefs } from "./types";
import { JEWISH_CALENDAR_PREFS_KEY } from "./types";

export function readJewishCalendarPrefs(): JewishCalendarPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(JEWISH_CALENDAR_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as JewishCalendarPrefs;
  } catch {
    return null;
  }
}

export function writeJewishCalendarPrefs(prefs: JewishCalendarPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(JEWISH_CALENDAR_PREFS_KEY, JSON.stringify(prefs));
}

export function buildDayQueryParams(prefs: JewishCalendarPrefs | null, date?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (!prefs) return params;
  if (prefs.locationId) {
    params.set("locationId", prefs.locationId);
  } else if (typeof prefs.lat === "number" && typeof prefs.lng === "number") {
    params.set("lat", String(prefs.lat));
    params.set("lng", String(prefs.lng));
    if (typeof prefs.elevation === "number") params.set("elevation", String(prefs.elevation));
  }
  return params;
}
