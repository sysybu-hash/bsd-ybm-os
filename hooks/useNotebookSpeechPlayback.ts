"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_NOTEBOOK_SPEECH_SETTINGS,
  loadNotebookSpeechSettings,
  pickVoiceForSettings,
  type NotebookSpeechSettings,
} from "@/lib/notebook-speech-settings";

export type SpeechPlaybackState = "idle" | "playing" | "paused";

export function useNotebookSpeechPlayback(settings: NotebookSpeechSettings) {
  const [playbackState, setPlaybackState] = useState<SpeechPlaybackState>("idle");
  const [charIndex, setCharIndex] = useState(0);
  const [textLength, setTextLength] = useState(0);

  const fullTextRef = useRef("");
  const charIndexRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const syncPausedFromEngine = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.speechSynthesis.paused;
  }, []);

  const speakFromIndex = useCallback((fromChar: number) => {
    if (typeof window === "undefined") return;
    const syn = window.speechSynthesis;
    syn.cancel();

    const raw = fullTextRef.current;
    const slice = raw.slice(fromChar).replace(/[*#`_]/g, "");
    if (!slice.trim()) {
      setPlaybackState("idle");
      setCharIndex(0);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(slice);
    const s = settingsRef.current;
    utterance.lang = "he-IL";
    utterance.rate = s.rate;
    utterance.pitch = s.pitch;
    utterance.volume = s.volume;

    const voices = syn.getVoices();
    const voice = pickVoiceForSettings(s, voices);
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      setPlaybackState("playing");
      charIndexRef.current = fromChar;
      setCharIndex(fromChar);
    };

    utterance.onboundary = (e) => {
      if (typeof e.charIndex === "number") {
        const absolute = fromChar + e.charIndex;
        charIndexRef.current = absolute;
        setCharIndex(absolute);
      }
    };

    utterance.onend = () => {
      setPlaybackState("idle");
      charIndexRef.current = 0;
      setCharIndex(0);
    };

    utterance.onerror = () => {
      setPlaybackState("idle");
    };

    setTextLength(raw.length);
    syn.speak(utterance);
  }, []);

  const play = useCallback(
    (text: string, fromChar = 0) => {
      const clean = text.replace(/[*#`_]/g, "");
      fullTextRef.current = clean;
      setTextLength(clean.length);
      charIndexRef.current = fromChar;
      setCharIndex(fromChar);
      speakFromIndex(fromChar);
    },
    [speakFromIndex],
  );

  const pause = useCallback(() => {
    if (typeof window === "undefined") return;
    const syn = window.speechSynthesis;
    if (!syn.speaking && playbackState !== "playing") return;

    if (syn.speaking && !syn.paused) {
      syn.pause();
      setPlaybackState("paused");
      return;
    }

    syn.cancel();
    setPlaybackState("paused");
  }, [playbackState]);

  const resume = useCallback(() => {
    if (typeof window === "undefined") return;
    const syn = window.speechSynthesis;

    if (syn.paused) {
      syn.resume();
      setPlaybackState("playing");
      return;
    }

    if (playbackState === "paused" && fullTextRef.current) {
      speakFromIndex(charIndexRef.current);
    }
  }, [playbackState, speakFromIndex]);

  const stop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setPlaybackState("idle");
    charIndexRef.current = 0;
    setCharIndex(0);
  }, []);

  const togglePlayPause = useCallback(
    (text: string) => {
      if (playbackState === "playing") {
        pause();
        return;
      }
      if (playbackState === "paused") {
        resume();
        return;
      }
      play(text, 0);
    },
    [pause, play, playbackState, resume],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVoices = () => {
      /* טעינת קולות בדפדפן */
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    onVoices();
    return () => window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (playbackState === "playing" && syncPausedFromEngine()) {
        setPlaybackState("paused");
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [playbackState, syncPausedFromEngine]);

  return {
    playbackState,
    charIndex,
    textLength,
    progress: textLength > 0 ? Math.min(100, Math.round((charIndex / textLength) * 100)) : 0,
    play,
    pause,
    resume,
    stop,
    togglePlayPause,
    isPlaying: playbackState === "playing",
    isPaused: playbackState === "paused",
  };
}

export function useNotebookSpeechSettingsState() {
  const [settings, setSettings] = useState<NotebookSpeechSettings>(DEFAULT_NOTEBOOK_SPEECH_SETTINGS);

  useEffect(() => {
    setSettings(loadNotebookSpeechSettings());
  }, []);

  return { settings, setSettings };
}
