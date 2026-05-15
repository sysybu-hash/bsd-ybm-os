import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";

export const GEMINI_LIVE_VOICE_STORAGE_KEY = "bsd:gemini-live-voice";

const VOICE_NAMES: GeminiLiveVoiceSettings["voiceName"][] = ["Puck", "Charon", "Kore", "Fenrir", "Aoede"];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isVoiceName(v: string): v is GeminiLiveVoiceSettings["voiceName"] {
  return (VOICE_NAMES as string[]).includes(v);
}

export function normalizeGeminiLiveVoiceSettings(raw: unknown): GeminiLiveVoiceSettings {
  const base = { ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;

  if (typeof o.voiceName === "string" && isVoiceName(o.voiceName)) base.voiceName = o.voiceName;
  if (typeof o.temperature === "number" && Number.isFinite(o.temperature)) {
    base.temperature = clamp(o.temperature, 0, 1.5);
  }
  if (typeof o.silenceDurationMs === "number" && Number.isFinite(o.silenceDurationMs)) {
    base.silenceDurationMs = clamp(Math.round(o.silenceDurationMs), 200, 3000);
  }
  if (typeof o.prefixPaddingMs === "number" && Number.isFinite(o.prefixPaddingMs)) {
    base.prefixPaddingMs = clamp(Math.round(o.prefixPaddingMs), 0, 1000);
  }
  if (typeof o.inputTranscription === "boolean") base.inputTranscription = o.inputTranscription;
  if (typeof o.outputTranscription === "boolean") base.outputTranscription = o.outputTranscription;
  if (o.responseMode === "audio" || o.responseMode === "audio_text") base.responseMode = o.responseMode;

  return base;
}

export function loadGeminiLiveVoiceSettings(): GeminiLiveVoiceSettings {
  if (typeof window === "undefined") return { ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS };
  try {
    const raw = window.localStorage.getItem(GEMINI_LIVE_VOICE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS };
    return normalizeGeminiLiveVoiceSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS };
  }
}

export function saveGeminiLiveVoiceSettings(settings: GeminiLiveVoiceSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GEMINI_LIVE_VOICE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}
