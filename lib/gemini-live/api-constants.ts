/**
 * ערכי API של Gemini Live כמחרוזות — בלי ייבוא runtime מ-`@google/genai`.
 * חיוני לצד לקוח (Next.js bundle) שבו enums עלולים להיעדר אחרי tree-shaking.
 */

export const GEMINI_LIVE_TURN_COVERAGE = {
  TURN_INCLUDES_ONLY_ACTIVITY: "TURN_INCLUDES_ONLY_ACTIVITY",
} as const;

export type GeminiLiveTurnCoverage =
  (typeof GEMINI_LIVE_TURN_COVERAGE)[keyof typeof GEMINI_LIVE_TURN_COVERAGE];

export const GEMINI_LIVE_MODALITY = {
  AUDIO: "AUDIO",
  TEXT: "TEXT",
} as const;

export type GeminiLiveModality =
  (typeof GEMINI_LIVE_MODALITY)[keyof typeof GEMINI_LIVE_MODALITY];

/** ערכי Type להצהרות functionDeclarations (תואם ל-`@google/genai` Type enum). */
export const GEMINI_SCHEMA_TYPE = {
  OBJECT: "OBJECT",
  STRING: "STRING",
  NUMBER: "NUMBER",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  ARRAY: "ARRAY",
} as const;
