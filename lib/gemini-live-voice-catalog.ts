import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";

export type SpeechStyle = GeminiLiveVoiceSettings["speechStyle"];

export const GEMINI_VOICE_OPTIONS: {
  id: GeminiLiveVoiceSettings["voiceName"];
  labelHe: string;
  style: SpeechStyle;
  descriptionHe: string;
}[] = [
  { id: "Charon", labelHe: "כרון — גברי עמוק", style: "masculine", descriptionHe: "ברירת מחדל — קול גברי רגוע ומקצועי" },
  { id: "Puck", labelHe: "פאק — גברי קליל", style: "masculine", descriptionHe: "גברי, אנרגטי יותר" },
  { id: "Fenrir", labelHe: "פניר — גברי חזק", style: "masculine", descriptionHe: "גברי, ביטחון ונוכחות" },
  { id: "Kore", labelHe: "קורה — נשי חם", style: "feminine", descriptionHe: "נשי, ברור וידידותי" },
  { id: "Aoede", labelHe: "אואדה — נשי רך", style: "feminine", descriptionHe: "נשי, רך ומוזיקלי" },
];

export const SPEECH_STYLE_OPTIONS: { id: SpeechStyle; labelHe: string }[] = [
  { id: "masculine", labelHe: "גברי (ברירת מחדל)" },
  { id: "feminine", labelHe: "נשי" },
  { id: "neutral", labelHe: "ניטרלי" },
];

const DEFAULT_VOICE_BY_STYLE: Record<SpeechStyle, GeminiLiveVoiceSettings["voiceName"]> = {
  masculine: "Charon",
  feminine: "Kore",
  neutral: "Puck",
};

export function voiceForSpeechStyle(style: SpeechStyle): GeminiLiveVoiceSettings["voiceName"] {
  return DEFAULT_VOICE_BY_STYLE[style];
}

export function labelForVoice(id: GeminiLiveVoiceSettings["voiceName"]): string {
  return GEMINI_VOICE_OPTIONS.find((v) => v.id === id)?.labelHe ?? id;
}
