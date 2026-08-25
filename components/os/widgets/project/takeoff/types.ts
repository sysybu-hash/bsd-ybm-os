/** נקודה במערכת הקואורדינטות הטבעית של התמונה (לפני zoom/pan) */
export type Point = { x: number; y: number };

/** מצב הכלי: מנוחה / כיול / מדידה / הזזה */
export type TakeoffMode = "idle" | "calibrate" | "measure" | "pan";

/** דיאלוג קלט פעיל */
export type DialogState =
  | { kind: "none" }
  | { kind: "calibrate"; distancePx: number }
  | { kind: "save"; area: number };

/** מדידה מוגמרת המועברת להורה לשמירה ל-BOQ */
export type TakeoffMeasurement = {
  /** שטח במ"ר */
  area: number;
  /** יחידת מידה */
  unit: string;
  /** תיאור השורה */
  description: string;
  /** קנה מידה (פיקסלים-תמונה למטר) */
  ppm: number;
  /** קודקודי הפוליגון בקואורדינטות התמונה */
  points: Point[];
};

/**
 * Persisted unit value for measured areas. It is stored on takeoff rows and
 * compared against, so it stays a stable literal rather than a translated
 * string — the *displayed* label comes from `workspaceWidgets.takeoff.sqmUnit`.
 */
export const SQM_UNIT = 'מ"ר'; // i18n-exempt: persisted unit value, see doc above
