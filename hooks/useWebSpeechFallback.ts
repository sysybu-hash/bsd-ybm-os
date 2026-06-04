"use client";

/**
 * Web Speech API fallback for voice capture.
 * Used when Gemini Live is unavailable (no API key, offline, unsupported browser).
 *
 * Returns null in SSR / browsers without SpeechRecognition support.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechState = "idle" | "listening" | "error";

type UseWebSpeechFallbackResult = {
  supported: boolean;
  state: SpeechState;
  interimTranscript: string;
  start: () => void;
  stop: () => void;
  error: string | null;
};

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

/**
 * @param onFinalTranscript - called each time a final (non-interim) segment lands
 * @param lang - BCP-47 locale for the recognizer (default "he-IL")
 */
export function useWebSpeechFallback(
  onFinalTranscript: (text: string) => void,
  lang = "he-IL",
): UseWebSpeechFallbackResult {
  const [state, setState] = useState<SpeechState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const start = useCallback(() => {
    if (!supported) return;
    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognizer = new SpeechRecognitionCtor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = lang;

    recognizer.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          if (transcript.trim()) onFinalRef.current(transcript.trim());
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText);
    };

    recognizer.onerror = (e) => {
      setState("error");
      setError((e as Event & { error: string }).error ?? "שגיאת זיהוי קול");
    };

    recognizer.onend = () => {
      setState("idle");
      setInterim("");
    };

    recognizerRef.current = recognizer;
    recognizer.start();
    setState("listening");
    setError(null);
  }, [supported, lang]);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setState("idle");
    setInterim("");
  }, []);

  useEffect(() => {
    return () => { recognizerRef.current?.stop(); };
  }, []);

  return { supported, state, interimTranscript: interim, start, stop, error };
}
