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

export const SQM_UNIT = 'מ"ר';
