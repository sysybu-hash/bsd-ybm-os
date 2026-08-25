"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildGeminiLiveStatusLabels,
  DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
  useGeminiLiveAudio,
} from "@/hooks/useGeminiLiveAudio";
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
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { createLogger } from "@/lib/logger";

const log = createLogger("omnibar-gemini-live");

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
  // Stored settings are unreadable on the server, so the defaults render first
  // and the stored values take over once the client is live. The memo keys on
  // `mounted`, so storage is parsed once rather than on every render.
  const mounted = useIsMounted();
  const storedVoiceSettings = useMemo(
    () => (mounted ? loadGeminiLiveVoiceSettings() : DEFAULT_GEMINI_LIVE_VOICE_SETTINGS),
    [mounted],
  );
  const [voiceSettingsOverride, setVoiceSettingsOverride] = useState<GeminiLiveVoiceSettings | null>(null);
  const geminiVoiceSettings = voiceSettingsOverride ?? storedVoiceSettings;
  const setGeminiVoiceSettings = setVoiceSettingsOverride;
  const [omnibarLiveOn, setOmnibarLiveOn] = useState(false);
  const liveStatusLabels = useMemo(() => buildGeminiLiveStatusLabels(t), [t]);
  /** true רק אחרי לחיצה מפורשת על המיקרופון — מונע toast על שגיאות שלא ביקש המשתמש */
  const userRequestedLiveRef = useRef(false);
  /** המשתמש לחץ מיקרופון לפני שההקשר מוכן — מחכים ל-contextReady ואז מתחברים פעם אחת */
  const pendingLiveStartRef = useRef(false);


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
    statusLabels: liveStatusLabels,
    onToolCall: async (name, args) => {
      const result = await osAssistant.onToolCall(name, args);
      const text = typeof result === "string" ? result : "Success";
      if (text === "Success") toast.success(t("workspaceWidgets.omnibar.voiceActionDone"));
      // sniffs the model reply for a refusal before toasting it as a success
      else if (!text.startsWith("לא ") && !text.startsWith("שגיאה")) toast.success(text); // i18n-exempt: matched, not shown
      return result;
    },
    shouldNotifyError: () => userRequestedLiveRef.current,
    onError: (err) => {
      log.warn("gemini live error", { error: String(err) });
      setErrorLatched(true);
      pendingLiveStartRef.current = false;
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

  /**
   * `notifyLiveError` can settle the client on "fallback" rather than "error"
   * while still reporting the failure, so the state mapping below would lose
   * the error label on its own. This latch carries it, and `toggleLive` clears
   * it when the user starts a fresh attempt.
   */
  const [errorLatched, setErrorLatched] = useState(false);

  // Otherwise a pure mapping of the live client's state, computed rather than
  // mirrored into state by an effect — which used to leave the label one render
  // behind the connection it describes.
  const derivedVoiceStatus: VoiceStatus =
    geminiLive.state === "connecting"
      ? "connecting"
      : geminiLive.state === "streaming"
        ? geminiLive.isSpeaking
          ? "speaking"
          : "listening"
        : geminiLive.state === "ready"
          ? "listening"
          : geminiLive.state === "error"
            ? "error"
            : "idle";
  const voiceStatus: VoiceStatus = errorLatched ? "error" : derivedVoiceStatus;

  const statusLabel = useMemo(() => {
    if (voiceStatus === "connecting") return t("workspaceWidgets.omnibar.voiceConnecting");
    if (voiceStatus === "listening") return t("workspaceWidgets.omnibar.voiceListening");
    if (voiceStatus === "speaking") return t("workspaceWidgets.omnibar.voiceSpeaking");
    return t("workspaceWidgets.omnibar.ready");
  }, [voiceStatus, t]);

  const voiceActive = voiceStatus === "listening" || voiceStatus === "speaking";

  useScreenWakeLock(
    voiceActive || geminiLive.isLiveActive || geminiLive.state === "connecting",
  );

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
    setErrorLatched(false);
    setOmnibarLiveOn(true);
    geminiLive.acknowledgeContextReady();
    void tryStartLive();
  };

  const rateLimitActive =
    isGeminiLiveRateLimited() ||
    (geminiLive.isRateLimited && !geminiLive.isLiveActive);

  /**
   * Fallback retry time, captured when the rate limit turns on rather than on
   * every render. `Date.now()` inside the memo below was impure — the label
   * would quietly drift later with each re-render, and the React Compiler rules
   * flag it. This is only reached when neither the cooldown store nor the live
   * client knows the real deadline.
   */
  const [fallbackRetryAt, setFallbackRetryAt] = useState<Date | null>(null);
  /**
   * This one stays in an effect on purpose. The deadline is a wall-clock
   * sample, and `Date.now()` during render is exactly what `react-hooks/purity`
   * forbids — the label would drift forward on every re-render, which is the
   * bug this state was introduced to fix in the first place.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFallbackRetryAt(rateLimitActive ? new Date(Date.now() + 60_000) : null);
  }, [rateLimitActive]);

  const rateLimitLabel = useMemo(() => {
    if (!rateLimitActive) return null;
    const untilMs = getGeminiLiveRateLimitCooldownUntilMs();
    const retryAt =
      untilMs != null ? new Date(untilMs) : geminiLive.rateLimitedUntil ?? fallbackRetryAt;
    if (!retryAt) return null;
    return formatGeminiLiveRateLimitMessage(retryAt, locale, t);
  }, [rateLimitActive, geminiLive.rateLimitedUntil, fallbackRetryAt, locale, t]);

  return {
    geminiLiveSettingsOpen, setGeminiLiveSettingsOpen,
    geminiVoiceSettings, setGeminiVoiceSettings,
    voiceStatus, voiceActive, statusLabel,
    geminiLive, toggleLive, rateLimitActive, rateLimitLabel,
    advancedFeaturesEnabled: osAssistant.featureFlags.geminiLiveAdvancedFeatures,
  };
}
