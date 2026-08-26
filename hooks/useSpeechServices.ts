"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { localeToSpeechLang } from "@/lib/i18n/speech-locale";
import { createLogger } from "@/lib/logger";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { useClientFlag } from "@/hooks/use-client-flag";

const log = createLogger("speech-services");

/** תואם Web Speech API — ללא `SpeechRecognitionEvent` בחלק מגרסאות `lib` של TypeScript */
type SpeechResultLike = { readonly 0: { transcript: string }; isFinal: boolean };
type SpeechResultsLike = { readonly length: number; [i: number]: SpeechResultLike };
type SpeechResultEvent = { resultIndex: number; results: SpeechResultsLike };

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

/** No SpeechRecognition constructor on this browser. */
function speechRecognitionUnsupported(): boolean {
  const win = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !win.SpeechRecognition && !win.webkitSpeechRecognition;
}

export function useSpeechServices(
  onTranscriptComplete: (transcript: string) => void,
) {
  const { locale, t } = useI18n();
  const speechLang = localeToSpeechLang(locale);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  /**
   * Whether the browser can do speech recognition at all is a fact about the
   * client, readable during render — not something an effect has to discover
   * and then write into state. The effect below only wires up the recogniser.
   */
  const unsupported = useClientFlag(speechRecognitionUnsupported);
  const [runtimeError, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onCompleteRef = useLatestRef(onTranscriptComplete);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    // The unsupported message is rendered from `speechUnsupported` below rather
    // than written here — see the note on that hook call.
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = speechLang;

    recognition.onresult = (event: SpeechResultEvent) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i]![0]!.transcript;
      }
      setTranscript(currentTranscript);

      const last = event.results[event.results.length - 1];
      if (last?.isFinal) {
        setIsListening(false);
        const trimmed = currentTranscript.trim();
        if (trimmed) {
          onCompleteRef.current(trimmed);
        }
      }
    };

    recognition.onerror = (ev: Event) => {
      log.error("speech recognition error", { event: String(ev) });
      setError(t("speech.notHeard"));
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.abort();
      } catch {
        /* */
      }
      recognitionRef.current = null;
    };
  }, [speechLang, t, onCompleteRef]);

  const startListening = useCallback(() => {
    setError(null);
    setTranscript("");
    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch {
      setError(t("speech.cannotStart"));
      setIsListening(false);
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [t]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* */
    }
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#`_]/g, "");
    if (!cleanText.trim()) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = speechLang;
    utterance.rate = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [speechLang]);

  return {
    isListening,
    isSpeaking,
    transcript,
    error: unsupported ? t("speech.unsupported") : runtimeError,
    startListening,
    stopListening,
    speak,
  };
}
