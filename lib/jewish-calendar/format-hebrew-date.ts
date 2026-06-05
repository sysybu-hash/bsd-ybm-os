import { gematriya, HDate } from "@hebcal/core";

const HEBREW_MONTHS = [
  "",
  "ניסן",
  "אייר",
  "סיוון",
  "תמוז",
  "אב",
  "אלול",
  "תשרי",
  "חשוון",
  "כסלו",
  "טבת",
  "שבט",
  "אדר",
  "אדר ב׳",
];

const HEBREW_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function formatHebrewDayGershayim(day: number): string {
  return gematriya(day);
}

export function formatHebrewYearGershayim(year: number): string {
  return gematriya(year % 1000);
}

export function formatHebrewDateDisplay(hd: HDate): { displayHe: string; displayEn: string; day: number; month: number; year: number } {
  const day = hd.getDate();
  const month = hd.getMonth();
  const year = hd.getFullYear();
  const monthHe = HEBREW_MONTHS[month] ?? hd.getMonthName();
  const displayHe = `${formatHebrewDayGershayim(day)} ${monthHe} ${formatHebrewYearGershayim(year)}`;
  const displayEn = hd.toString();
  return { displayHe, displayEn, day, month, year };
}

export function hebrewWeekday(date: Date, locale: "he" | "en" = "he"): string {
  const idx = date.getDay();
  if (locale === "he") return `יום ${HEBREW_WEEKDAYS[idx]}`;
  return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Jerusalem" });
}

export function formatGregorianDisplay(date: Date): { displayHe: string; displayEn: string; iso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  const iso = `${y}-${m}-${d}`;
  const displayEn = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  });
  const displayHe = date.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  });
  return { displayHe, displayEn, iso };
}
