"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
  useGeminiLiveAudio,
  type GeminiLiveStatusLabels,
} from "@/hooks/useGeminiLiveAudio";
import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { buildMarketingPublicUrls } from "@/lib/marketing/canonical-site";
import { buildMarketingLandingSystemInstruction } from "@/lib/marketing/landing-assistant-prompt";
import {
  buildMarketingLiveFarewellUserTurn,
  buildMarketingLiveSessionStartUserTurn,
} from "@/lib/marketing/marketing-live-greeting";
import { sanitizeMarketingAssistantReply } from "@/lib/marketing/sanitize-marketing-reply";
import {
  MARKETING_CHAT_API,
  MARKETING_LIVE_FAREWELL_BEFORE_MS,
  MARKETING_LIVE_MAX_MS,
  MARKETING_LIVE_SESSION_API,
} from "@/lib/marketing/live-constants";

export type MarketingChatMessage = Readonly<{
  id: string;
  role: "user" | "assistant";
  content: string;
}>;

type TranslateFn = (key: string, vars?: Record<string, string>) => string;

function mapVoiceStatus(
  state: string,
): "idle" | "connecting" | "listening" | "speaking" | "error" {
  if (state === "connecting") return "connecting";
  if (state === "streaming") return "listening";
  if (state === "ready") return "listening";
  return "idle";
}

export function useMarketingHeroOmnibar(t: TranslateFn, localeInput: string) {
  const locale: AppLocale = normalizeLocale(localeInput);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MarketingChatMessage[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [liveOn, setLiveOn] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const userRequestedLiveRef = useRef(false);
  const pendingLiveStartRef = useRef(false);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const farewellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const farewellSentRef = useRef(false);
  const geminiLiveRef = useRef<ReturnType<typeof useGeminiLiveAudio> | null>(null);
  const liveSessionDeadlineRef = useRef<number | null>(null);
  const endLiveSessionRef = useRef<(timedOut: boolean) => void>(() => undefined);
  const liveDraftIdRef = useRef("marketing-live-assistant");
  const [browserOrigin, setBrowserOrigin] = useState<string | undefined>(undefined);

  useEffect(() => {
    setBrowserOrigin(window.location.origin);
  }, []);

  const systemInstruction = useMemo(
    () =>
      buildMarketingLandingSystemInstruction(locale, "voice", {
        browserOrigin,
      }),
    [browserOrigin, locale],
  );

  const statusLabels: GeminiLiveStatusLabels = useMemo(
    () => ({
      ready: t("marketingHome.cinematic.omnibarStatusReady"),
      connected: t("marketingHome.cinematic.omnibarStatusConnected"),
      listening: t("marketingHome.cinematic.omnibarStatusListening"),
      speaking: t("marketingHome.cinematic.omnibarStatusSpeaking"),
      interrupted: t("marketingHome.cinematic.omnibarStatusListening"),
      tool: t("marketingHome.cinematic.omnibarStatusListening"),
      disconnected: t("marketingHome.cinematic.omnibarStatusDisconnected"),
      preparing: t("marketingHome.cinematic.omnibarStatusConnecting"),
      fallback: t("marketingHome.cinematic.omnibarLiveUnavailable"),
    }),
    [t],
  );

  const appendAssistantMessage = useCallback((content: string) => {
    const trimmed = sanitizeMarketingAssistantReply(content);
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { id: `a-${Date.now()}`, role: "assistant", content: trimmed },
    ]);
  }, []);

  const upsertLiveAssistantDraft = useCallback((text: string, finished: boolean) => {
    const trimmed = sanitizeMarketingAssistantReply(text);
    if (!trimmed) return;
    const draftId = liveDraftIdRef.current;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === draftId);
      const next: MarketingChatMessage = {
        id: draftId,
        role: "assistant",
        content: trimmed,
      };
      if (idx === -1) return [...prev, next];
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
    if (finished) {
      liveDraftIdRef.current = `marketing-live-assistant-${Date.now()}`;
    }
  }, []);

  const clearLiveTimers = useCallback(() => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    if (farewellTimerRef.current) {
      clearTimeout(farewellTimerRef.current);
      farewellTimerRef.current = null;
    }
  }, []);

  const geminiLive = useGeminiLiveAudio({
    owner: "marketingOmnibar",
    enabled: liveOn,
    contextReady: true,
    systemInstruction,
    settings: DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
    advancedFeaturesEnabled: false,
    statusLabels,
    locale,
    greetOnConnect: true,
    buildSessionStartUserTurn: buildMarketingLiveSessionStartUserTurn,
    translate: t,
    sessionTokenUrl: MARKETING_LIVE_SESSION_API,
    shouldNotifyError: () => userRequestedLiveRef.current,
    onModelTranscript: upsertLiveAssistantDraft,
    onError: (message) => {
      userRequestedLiveRef.current = false;
      setLiveOn(false);
      clearLiveTimers();
      toast.error(message);
    },
  });

  geminiLiveRef.current = geminiLive;

  const endLiveSession = useCallback(
    (timedOut: boolean) => {
      geminiLive.stop();
      setLiveOn(false);
      userRequestedLiveRef.current = false;
      liveSessionDeadlineRef.current = null;
      farewellSentRef.current = false;
      clearLiveTimers();
      if (timedOut) {
        setSessionEnded(true);
        appendAssistantMessage(t("marketingHome.cinematic.omnibarSessionEnded"));
      }
    },
    [appendAssistantMessage, clearLiveTimers, geminiLive, t],
  );

  endLiveSessionRef.current = endLiveSession;

  const scheduleLiveHardStop = useCallback(() => {
    clearLiveTimers();
    if (liveSessionDeadlineRef.current == null) {
      liveSessionDeadlineRef.current = Date.now() + MARKETING_LIVE_MAX_MS;
    }
    const remaining = liveSessionDeadlineRef.current - Date.now();
    if (remaining <= 0) {
      endLiveSessionRef.current(true);
      return;
    }
    const farewellIn = remaining - MARKETING_LIVE_FAREWELL_BEFORE_MS;
    if (farewellIn > 0 && !farewellSentRef.current) {
      farewellTimerRef.current = setTimeout(() => {
        if (farewellSentRef.current) return;
        farewellSentRef.current = true;
        geminiLiveRef.current?.sendUserTextTurn(buildMarketingLiveFarewellUserTurn(locale));
      }, farewellIn);
    }
    sessionTimerRef.current = setTimeout(() => {
      endLiveSessionRef.current(true);
    }, remaining);
  }, [clearLiveTimers, locale]);

  const voiceStatus = geminiLive.state === "error" ? "error" : mapVoiceStatus(geminiLive.state);
  const voiceActive = voiceStatus !== "idle" && voiceStatus !== "error";

  const statusLabel =
    voiceStatus === "connecting"
      ? t("marketingHome.cinematic.omnibarStatusConnecting")
      : voiceStatus === "listening"
        ? t("marketingHome.cinematic.omnibarStatusListening")
        : voiceStatus === "speaking"
          ? t("marketingHome.cinematic.omnibarStatusSpeaking")
          : isBusy
            ? t("marketingHome.cinematic.omnibarStatusThinking")
            : t("marketingHome.cinematic.omnibarStatusReady");

  const tryStartLive = useCallback(async () => {
    if (!pendingLiveStartRef.current || !liveOn) return;
    if (geminiLive.isLiveActive || geminiLive.state === "connecting") return;

    pendingLiveStartRef.current = false;
    const started = await geminiLive.start();
    if (!started) {
      setLiveOn(false);
      userRequestedLiveRef.current = false;
      liveSessionDeadlineRef.current = null;
      const detail = geminiLive.statusText.trim();
      const fallbackLabel = statusLabels.fallback;
      toast.error(
        detail && detail !== fallbackLabel
          ? detail
          : t("marketingHome.cinematic.omnibarLiveUnavailable"),
      );
      return;
    }
    scheduleLiveHardStop();
  }, [geminiLive, liveOn, scheduleLiveHardStop, statusLabels.fallback, t]);

  useEffect(() => {
    if (liveOn && pendingLiveStartRef.current) {
      void tryStartLive();
    }
  }, [liveOn, tryStartLive]);

  const toggleLive = useCallback(() => {
    if (geminiLive.isLiveActive || liveOn) {
      pendingLiveStartRef.current = false;
      endLiveSession(false);
      return;
    }
    userRequestedLiveRef.current = true;
    setSessionEnded(false);
    liveSessionDeadlineRef.current = null;
    farewellSentRef.current = false;
    liveDraftIdRef.current = `marketing-live-assistant-${Date.now()}`;
    pendingLiveStartRef.current = true;
    setLiveOn(true);
  }, [endLiveSession, geminiLive.isLiveActive, liveOn]);

  const sendMessage = useCallback(async () => {
    const value = input.trim();
    if (!value || isBusy || voiceActive) return;

    const userMsg: MarketingChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: value,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsBusy(true);

    try {
      const history = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await fetch(MARKETING_CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, locale, history }),
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? t("marketingHome.cinematic.omnibarChatError"));
      }
      appendAssistantMessage(data.text ?? "");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("marketingHome.cinematic.omnibarChatError");
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  }, [appendAssistantMessage, input, isBusy, locale, messages, t, voiceActive]);

  const registerHref = buildMarketingPublicUrls().register;

  return {
    input,
    setInput,
    messages,
    isBusy,
    voiceStatus,
    voiceActive,
    statusLabel,
    sessionEnded,
    toggleLive,
    sendMessage,
    registerHref,
    lastTranscript: geminiLive.lastTranscript,
    showPanel: messages.length > 0 || voiceActive || sessionEnded || liveOn,
  };
}

export type MarketingHeroOmnibarState = ReturnType<typeof useMarketingHeroOmnibar>;
