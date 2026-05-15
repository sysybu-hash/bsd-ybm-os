import type { SpeechStyle } from "@/lib/gemini-live-voice-catalog";
import { SPEECH_STYLE_OPTIONS } from "@/lib/gemini-live-voice-catalog";

export type NotebookSpeechSettings = {
  speechStyle: SpeechStyle;
  /** null = בחירה אוטומטית לפי סגנון */
  voiceURI: string | null;
  rate: number;
  pitch: number;
  volume: number;
};

export const NOTEBOOK_SPEECH_STORAGE_KEY = "bsd:notebook-speech";

export const DEFAULT_NOTEBOOK_SPEECH_SETTINGS: NotebookSpeechSettings = {
  speechStyle: "masculine",
  voiceURI: null,
  rate: 1,
  pitch: 1,
  volume: 1,
};

const STYLES: SpeechStyle[] = ["masculine", "feminine", "neutral"];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isSpeechStyle(v: string): v is SpeechStyle {
  return (STYLES as string[]).includes(v);
}

export function normalizeNotebookSpeechSettings(raw: unknown): NotebookSpeechSettings {
  const base = { ...DEFAULT_NOTEBOOK_SPEECH_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (typeof o.speechStyle === "string" && isSpeechStyle(o.speechStyle)) {
    base.speechStyle = o.speechStyle;
  }
  if (typeof o.voiceURI === "string" && o.voiceURI.trim()) base.voiceURI = o.voiceURI.trim();
  else if (o.voiceURI === null) base.voiceURI = null;
  if (typeof o.rate === "number" && Number.isFinite(o.rate)) base.rate = clamp(o.rate, 0.5, 2);
  if (typeof o.pitch === "number" && Number.isFinite(o.pitch)) base.pitch = clamp(o.pitch, 0.5, 2);
  if (typeof o.volume === "number" && Number.isFinite(o.volume)) base.volume = clamp(o.volume, 0, 1);
  return base;
}

export function loadNotebookSpeechSettings(): NotebookSpeechSettings {
  if (typeof window === "undefined") return { ...DEFAULT_NOTEBOOK_SPEECH_SETTINGS };
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_SPEECH_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTEBOOK_SPEECH_SETTINGS };
    return normalizeNotebookSpeechSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTEBOOK_SPEECH_SETTINGS };
  }
}

export function saveNotebookSpeechSettings(settings: NotebookSpeechSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTEBOOK_SPEECH_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota */
  }
}

export function listHebrewVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined") return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("he"));
}

function voiceScore(v: SpeechSynthesisVoice, style: SpeechStyle): number {
  const blob = `${v.name} ${v.voiceURI}`.toLowerCase();
  let score = 10;
  if (style === "feminine") {
    if (/female|woman|girl|heila|hila|carmit|naomi|female|נקבה|ילה|הילה|זהבה/i.test(blob)) score += 20;
    if (/asaf|male|man|דוד|אסף|גבר/i.test(blob)) score -= 8;
  } else if (style === "masculine") {
    if (/male|man|asaf|אסף|דוד|גבר/i.test(blob)) score += 20;
    if (/female|woman|heila|hila|נקבה|ילה/i.test(blob)) score -= 8;
  }
  if (v.default) score += 2;
  return score;
}

export function pickVoiceForSettings(
  settings: NotebookSpeechSettings,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const he = voices.length ? voices : listHebrewVoices();
  if (!he.length) return null;
  if (settings.voiceURI) {
    const exact = he.find((v) => v.voiceURI === settings.voiceURI);
    if (exact) return exact;
  }
  const sorted = [...he].sort((a, b) => voiceScore(b, settings.speechStyle) - voiceScore(a, settings.speechStyle));
  return sorted[0] ?? null;
}

export { SPEECH_STYLE_OPTIONS };
