"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_GEMINI_LIVE_VOICE_SETTINGS, useGeminiLiveAudio } from "@/hooks/useGeminiLiveAudio";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { loadGeminiLiveVoiceSettings } from "@/lib/gemini-live-voice-settings";
import { formatGeminiLiveRateLimitMessage } from "@/lib/gemini-live-user-message";
import {
  getGeminiLiveRateLimitCooldownUntilMs,
  isGeminiLiveRateLimited,
} from "@/lib/gemini-live/rate-limit-cooldown";
import {
  isGeminiLiveAllowedByContext,
  isGeminiLiveContextReady,
  isGeminiLiveSessionEligible,
  resolveGeminiLiveOrgId,
} from "@/lib/gemini-live/eligibility";
import type { OsAssistantUserContext } from "@/lib/os-assistant/user-context";

type OsAssistantSlice = {
  context: OsAssistantUserContext | null;
  featureFlags: { geminiLiveEnabled?: boolean; geminiLiveAdvancedFeatures?: boolean };
  ready: boolean;
  loading: boolean;
  systemInstructionVoice?: string;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<string>;
};

type UseOmnibarGeminiLiveArgs = {
  sessionUserId?: string | null;
  sessionOrgId?: string | null;
  osAssistant: OsAssistantSlice;
  userName?: string;
  locale: string;
  t: (key: string) => string;
};

export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

export function useOmnibarGeminiLive({
  sessionUserId, sessionOrgId, osAssistant, userName, locale, t,
}: UseOmnibarGeminiLiveArgs) {
  const [geminiLiveSettingsOpen, setGeminiLiveSettingsOpen] = useState(false);
  const [geminiVoiceSettings, setGeminiVoiceSettings] = useState<GeminiLiveVoiceSettings>(DEFAULT_GEMINI_LIVE_VOICE_SETTINGS);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [omnibarLiveOn, setOmnibarLiveOn] = useState(false);
  /** true רק אחרי לחיצה מפורשת על המיקרופון — מונע toast על שגיאות שלא ביקש המשתמש */
  const userRequestedLiveRef = useRef(false);
  /** המשתמש לחץ מיקרופון לפני שההקשר מוכן — מחכים ל-contextReady ואז מתחברים פעם אחת */
  const pendingLiveStartRef = useRef(false);

  useEffect(() => { setGeminiVoiceSettings(loadGeminiLiveVoiceSettings()); }, []);

  const liveOrgId = resolveGeminiLiveOrgId(sessionOrgId, osAssistant.context);
  const geminiLiveEligible =
    isGeminiLiveSessionEligible({ userId: sessionUserId, orgId: liveOrgId, platformEnabled: osAssistant.featureFlags.geminiLiveEnabled }) &&
    isGeminiLiveAllowedByContext(osAssistant.context);

  const liveContextReady = isGeminiLiveContextReady({
    assistantReady: osAssistant.ready,
    assistantLoading: osAssistant.loading,
    systemInstructionVoice: osAssistant.systemInstructionVoice ?? "",
    context: osAssistant.context,
  });

  const geminiLive = useGeminiLiveAudio({
    owner: "omnibar",
    enabled: omnibarLiveOn && geminiLiveEligible,
    contextReady: liveContextReady,
    settings: geminiVoiceSettings,
    advancedFeaturesEnabled: osAssistant.featureFlags.geminiLiveAdvancedFeatures,
    systemInstruction: osAssistant.systemInstructionVoice ?? "",
    locale,
    userName,
    greetOnConnect: true,
    translate: t,
    onToolCall: async (name, args) => {
      const result = await osAssistant.onToolCall(name, args);
      const text = typeof result === "string" ? result : "Success";
      if (text === "Success") toast.success(t("workspaceWidgets.omnibar.voiceActionDone"));
      else if (!text.startsWith("לא ") && !text.startsWith("שגיאה")) toast.success(text);
      return result;
    },
    onError: (err) => {
      if (process.env.NODE_ENV === "development") console.warn("Gemini Live:", err);
      setVoiceStatus("error");
      pendingLiveStartRef.current = false;
      if (!userRequestedLiveRef.current) return;
      userRequestedLiveRef.current = false;
      toast.error(err);
      if (isGeminiLiveRateLimited()) setOmnibarLiveOn(false);
    },
  });

  useEffect(() => {
    const onOwnerChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ owner?: string | null }>).detail;
      if (detail?.owner === "aiChatFull") {
        geminiLive.stop();
        pendingLiveStartRef.current = false;
        userRequestedLiveRef.current = false;
        setOmnibarLiveOn(false);
      }
    };
    window.addEventListener("gemini-live:owner-changed", onOwnerChange);
    return () => window.removeEventListener("gemini-live:owner-changed", onOwnerChange);
  }, [geminiLive]);

  const tryStartLive = useCallback(async () => {
    if (!pendingLiveStartRef.current || !omnibarLiveOn || !geminiLiveEligible) return;
    if (!liveContextReady) return;
    if (isGeminiLiveRateLimited() || geminiLive.isRateLimited) return;
    if (geminiLive.isLiveActive || geminiLive.state === "connecting") return;
    if (geminiLive.state === "fallback" || geminiLive.state === "error") return;
    pendingLiveStartRef.current = false;
    const ok = await geminiLive.start();
    if (!ok) {
      userRequestedLiveRef.current = false;
      setOmnibarLiveOn(false);
    }
  }, [omnibarLiveOn, geminiLiveEligible, liveContextReady, geminiLive]);

  useEffect(() => {
    if (geminiLive.state === "connecting") setVoiceStatus("connecting");
    else if (geminiLive.state === "streaming") setVoiceStatus(geminiLive.isSpeaking ? "speaking" : "listening");
    else if (geminiLive.state === "ready") setVoiceStatus("listening");
    else if (geminiLive.state === "error") setVoiceStatus("error");
    else setVoiceStatus("idle");
  }, [geminiLive.state, geminiLive.isSpeaking]);

  const statusLabel = useMemo(() => {
    if (voiceStatus === "connecting") return t("workspaceWidgets.omnibar.voiceConnecting");
    if (voiceStatus === "listening") return t("workspaceWidgets.omnibar.voiceListening");
    if (voiceStatus === "speaking") return t("workspaceWidgets.omnibar.voiceSpeaking");
    return t("workspaceWidgets.omnibar.ready");
  }, [voiceStatus, t]);

  const voiceActive = voiceStatus === "listening" || voiceStatus === "speaking";

  const toggleLive = () => {
    if (geminiLive.isLiveActive) {
      geminiLive.stop();
      pendingLiveStartRef.current = false;
      userRequestedLiveRef.current = false;
      setOmnibarLiveOn(false);
      return;
    }
    if (isGeminiLiveRateLimited()) {
      const untilMs = getGeminiLiveRateLimitCooldownUntilMs();
      const retryAt = untilMs != null ? new Date(untilMs) : new Date(Date.now() + 60_000);
      toast.error(formatGeminiLiveRateLimitMessage(retryAt, locale, t));
      return;
    }
    if (!liveContextReady) {
      toast.error(t("workspaceWidgets.aiChat.liveContextLoading"));
      pendingLiveStartRef.current = false;
      userRequestedLiveRef.current = false;
      return;
    }
    userRequestedLiveRef.current = true;
    pendingLiveStartRef.current = true;
    setOmnibarLiveOn(true);
    geminiLive.acknowledgeContextReady();
    void tryStartLive();
  };

  const rateLimitActive =
    isGeminiLiveRateLimited() ||
    (geminiLive.isRateLimited && !geminiLive.isLiveActive);

  const rateLimitLabel = useMemo(() => {
    if (!rateLimitActive) return null;
    const untilMs = getGeminiLiveRateLimitCooldownUntilMs();
    const retryAt =
      untilMs != null
        ? new Date(untilMs)
        : geminiLive.rateLimitedUntil ?? new Date(Date.now() + 60_000);
    return formatGeminiLiveRateLimitMessage(retryAt, locale, t);
  }, [rateLimitActive, geminiLive.rateLimitedUntil, locale, t]);

  return {
    geminiLiveSettingsOpen, setGeminiLiveSettingsOpen,
    geminiVoiceSettings, setGeminiVoiceSettings,
    voiceStatus, voiceActive, statusLabel,
    geminiLive, toggleLive, rateLimitActive, rateLimitLabel,
    advancedFeaturesEnabled: osAssistant.featureFlags.geminiLiveAdvancedFeatures,
  };
}
