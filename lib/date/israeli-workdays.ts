/**
 * Israeli construction work-week date math.
 *
 * The Israeli work-week runs Sunday → Thursday. Friday and Saturday are
 * non-working days on construction sites. JS `Date.getDay()` returns
 * 0=Sunday … 4=Thursday, 5=Friday, 6=Saturday.
 *
 * All helpers are pure and return NEW Date objects (never mutate the input).
 */

const FRIDAY = 5;
const SATURDAY = 6;

/** True if the date falls on the Israeli weekend (Friday or Saturday). */
export function isIsraeliWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === FRIDAY || day === SATURDAY;
}

/**
 * If `date` lands on a weekend, move it forward to the next Sunday.
 * A date already on a working day is returned unchanged (as a copy).
 */
export function adjustToNextIsraeliWorkday(date: Date): Date {
  const d = new Date(date);
  while (isIsraeliWeekend(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * Returns the date that is `days` WORKING days after `startDate`, skipping
 * every Friday and Saturday along the way.
 *
 * Semantics: each whole working day advances the cursor by one Sun–Thu day.
 * `addIsraeliWorkDays(thursday, 1)` → the following Sunday (Fri/Sat skipped).
 * Non-positive `days` returns a copy of `startDate` unchanged.
 */
export function addIsraeliWorkDays(startDate: Date, days: number): Date {
  const d = new Date(startDate);
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isIsraeliWeekend(d)) remaining -= 1;
  }
  return d;
}
