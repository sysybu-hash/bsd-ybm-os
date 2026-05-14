import { OS_UNLIMITED_CREDITS } from "@/lib/platform-developers";

/** מכסות "אינסוף" למפתחי המערכת — לא מציגים את המספר הגולמי */
export function isEffectivelyUnlimitedCredits(value: number): boolean {
  return value >= 1_000_000_000 || value === OS_UNLIMITED_CREDITS;
}

export function formatCreditsForDisplay(value: number): string {
  if (isEffectivelyUnlimitedCredits(value)) {
    return "ללא הגבלה (מפתח מערכת)";
  }
  return value.toLocaleString("he-IL");
}
