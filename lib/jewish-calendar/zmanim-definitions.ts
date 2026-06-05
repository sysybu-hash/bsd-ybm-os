import type { Zmanim } from "@hebcal/core";

export type ZmanDefinition = {
  id: string;
  labelHe: string;
  labelEn: string;
  compute: (z: Zmanim) => Date | null;
};

function safe(fn: () => Date | null): Date | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function aseretHaTefilot(z: Zmanim): Date | null {
  const sunrise = safe(() => z.sunrise());
  const sunset = safe(() => z.sunset());
  if (!sunrise || !sunset) return null;
  const dayMs = sunset.getTime() - sunrise.getTime();
  return new Date(sunrise.getTime() + (10 / 12) * dayMs);
}

function alot90(z: Zmanim): Date | null {
  return safe(() => z.sunriseOffset(-90, true));
}

export const ZMANIM_DEFINITIONS: ZmanDefinition[] = [
  { id: "chatzotNight", labelHe: "חצות", labelEn: "Midnight (halachic)", compute: (z) => safe(() => z.chatzotNight()) },
  { id: "alot72", labelHe: "עלות השחר (72 דק׳)", labelEn: "Alot hashachar (72 min)", compute: (z) => safe(() => z.alotHaShachar72()) },
  { id: "alot90", labelHe: "עלות השחר (90 דק׳)", labelEn: "Alot hashachar (90 min)", compute: alot90 },
  { id: "misheyakir", labelHe: "טלית ותפילין", labelEn: "Tallit & tefillin", compute: (z) => safe(() => z.misheyakirMachmir()) },
  { id: "sunrise", labelHe: "הנץ החמה", labelEn: "Sunrise", compute: (z) => safe(() => z.sunrise()) },
  { id: "sofZmanShmaMGA", labelHe: "סוף זמן קריאת שמע (מג״א)", labelEn: "Sof zman Shema (MGA)", compute: (z) => safe(() => z.sofZmanShmaMGA()) },
  { id: "sofZmanShmaGRA", labelHe: "סוף זמן קריאת שמע (גר״א)", labelEn: "Sof zman Shema (GRA)", compute: (z) => safe(() => z.sofZmanShma()) },
  { id: "sofZmanTfillaMGA", labelHe: "סוף זמן תפילה (מג״א)", labelEn: "Sof zman tefilla (MGA)", compute: (z) => safe(() => z.sofZmanTfillaMGA()) },
  { id: "sofZmanTfillaGRA", labelHe: "סוף זמן תפילה (גר״א)", labelEn: "Sof zman tefilla (GRA)", compute: (z) => safe(() => z.sofZmanTfilla()) },
  { id: "chatzotDay", labelHe: "חצות היום", labelEn: "Chatzot hayom", compute: (z) => safe(() => z.chatzot()) },
  { id: "minchaGedola", labelHe: "מנחה גדולה", labelEn: "Mincha gedola", compute: (z) => safe(() => z.minchaGedola()) },
  { id: "minchaKetana", labelHe: "מנחה קטנה", labelEn: "Mincha ketana", compute: (z) => safe(() => z.minchaKetana()) },
  { id: "aseretHaTefilot", labelHe: "שעה עשירית", labelEn: "10th hour", compute: aseretHaTefilot },
  { id: "plagHaMincha", labelHe: "פלג המנחה", labelEn: "Plag hamincha", compute: (z) => safe(() => z.plagHaMincha()) },
  { id: "sunset", labelHe: "שקיעה", labelEn: "Sunset", compute: (z) => safe(() => z.sunset()) },
  { id: "tzeit", labelHe: "צאת הכוכבים", labelEn: "Tzeit hakochavim", compute: (z) => safe(() => z.tzeit()) },
  { id: "tzeitRT", labelHe: "צאת ר״ת", labelEn: "Tzeit Rabbeinu Tam", compute: (z) => safe(() => z.tzaisBaalHatanya()) },
];
