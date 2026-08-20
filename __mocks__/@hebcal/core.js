/**
 * Manual Jest mock for @hebcal/core (ESM-only, no CJS entry point — Jest's
 * resolver can't require() it). Only lib/jewish-calendar/is-jewish-rest-day.ts
 * imports this package; nothing in this test suite exercises real Jewish-calendar
 * logic, so a permissive stub (never a rest day) is safe here.
 */

class Location {
  constructor() {}
  static lookup() {
    return null;
  }
}

class HDate {
  getDay() {
    return 0;
  }
  prev() {
    return this;
  }
  next() {
    return this;
  }
}

class CandleLightingEvent {}
class HavdalahEvent {}

const flags = {
  CHAG: 1,
  CHOL_HAMOED: 2,
};

const HebrewCalendar = {
  getHolidaysOnDate: () => [],
  calendar: () => [],
};

module.exports = { Location, HDate, CandleLightingEvent, HavdalahEvent, flags, HebrewCalendar };
