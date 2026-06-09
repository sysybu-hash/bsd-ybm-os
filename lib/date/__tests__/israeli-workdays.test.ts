import { addIsraeliWorkDays, adjustToNextIsraeliWorkday, isIsraeliWeekend } from "@/lib/date/israeli-workdays";

// Reference dates (local time). 2026-06-07 is a Sunday.
const SUN = new Date(2026, 5, 7); // Sunday
const THU = new Date(2026, 5, 11); // Thursday
const FRI = new Date(2026, 5, 12); // Friday
const SAT = new Date(2026, 5, 13); // Saturday

describe("israeli-workdays", () => {
  it("identifies Friday and Saturday as the weekend", () => {
    expect(isIsraeliWeekend(FRI)).toBe(true);
    expect(isIsraeliWeekend(SAT)).toBe(true);
    expect(isIsraeliWeekend(SUN)).toBe(false);
    expect(isIsraeliWeekend(THU)).toBe(false);
  });

  it("adjusts a weekend start forward to Sunday", () => {
    expect(adjustToNextIsraeliWorkday(FRI).getDate()).toBe(14); // → Sun 2026-06-14
    expect(adjustToNextIsraeliWorkday(SAT).getDate()).toBe(14);
    // a working day is unchanged
    expect(adjustToNextIsraeliWorkday(SUN).getDate()).toBe(7);
  });

  it("does not mutate the input date", () => {
    const input = new Date(SAT);
    adjustToNextIsraeliWorkday(input);
    addIsraeliWorkDays(input, 5);
    expect(input.getTime()).toBe(SAT.getTime());
  });

  it("skips Fri/Sat when adding working days", () => {
    // Thursday + 1 working day → Sunday (skip Fri+Sat)
    expect(addIsraeliWorkDays(THU, 1).getDate()).toBe(14);
    // Sunday + 4 working days → Thursday (Sun→Mon→Tue→Wed→Thu)
    expect(addIsraeliWorkDays(SUN, 4).getDate()).toBe(11);
    // Sunday + 5 working days → next Sunday (skips the weekend)
    expect(addIsraeliWorkDays(SUN, 5).getDate()).toBe(14);
  });

  it("returns a copy unchanged for non-positive days", () => {
    expect(addIsraeliWorkDays(SUN, 0).getTime()).toBe(SUN.getTime());
    expect(addIsraeliWorkDays(SUN, -3).getTime()).toBe(SUN.getTime());
  });
});
