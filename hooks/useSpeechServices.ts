"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { localeToSpeechLang } from "@/lib/i18n/speech-locale";

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

export function useSpeechServices(
  onTranscriptComplete: (transcript: string) => void,
) {
  const { locale } = useI18n();
  const speechLang = localeToSpeechLang(locale);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onCompleteRef = useRef(onTranscriptComplete);
  onCompleteRef.current = onTranscriptComplete;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) {
      setError("הדפדפן שלך לא תומך בזיהוי קולי. נסה כרום.");
      return;
    }

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
      console.error("Speech Recognition Error:", ev);
      setError("לא הצלחתי לשמוע. נסה שוב.");
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
  }, [speechLang]);

  const startListening = useCallback(() => {
    setError(null);
    setTranscript("");
    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch {
      setError("לא ניתן להפעיל האזנה. נסה שוב.");
      setIsListening(false);
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

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
    error,
    startListening,
    stopListening,
    speak,
  };
}
