export type JewishCalendarLocation = {
  id: string;
  nameHe: string;
  nameEn: string;
  lat: number;
  lng: number;
  elevation: number;
  timezone: string;
};

export type ZmanEntry = {
  id: string;
  labelHe: string;
  labelEn: string;
  at: string;
  minutesFromMidnight: number;
};

export type DaySnapshot = {
  location: Pick<JewishCalendarLocation, "id" | "nameHe" | "nameEn" | "lat" | "lng">;
  gregorian: {
    iso: string;
    weekdayHe: string;
    weekdayEn: string;
    displayHe: string;
    displayEn: string;
  };
  hebrew: {
    displayHe: string;
    displayEn: string;
    day: number;
    month: number;
    year: number;
  };
  parasha?: string;
  clock: { timezone: string };
  zmanim: ZmanEntry[];
  nextZmanId: string | null;
  shabbat?: {
    candleLighting: string;
    havdalah: string;
    parasha?: string;
  };
};

export type JewishCalendarPrefs = {
  source: "geolocation" | "city" | "manual";
  locationId?: string;
  lat?: number;
  lng?: number;
  elevation?: number;
  geoDeniedAt?: string;
};

export const JEWISH_CALENDAR_PREFS_KEY = "bsd_ybm_jewish_calendar_v1";
