"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useAutomationRunnerContext } from "@/components/os/AutomationRunnerContext";
import { useI18n } from "@/components/os/system/I18nProvider";import { useGeminiLiveAudio, DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";
import type { GeminiLiveStatusLabels, GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { useOsAssistant } from "@/hooks/use-os-assistant";
import { getAssistantVisibleTranscript } from "@/lib/ai/filter-assistant-visible-text";
import { APP_BUILDER_CHAT_SYSTEM_PROMPT } from "@/lib/app-builder/chat-system-prompt";
import {
  isGeminiLiveAllowedByContext,
  isGeminiLiveContextReady,
  isGeminiLiveSessionEligible,
  resolveGeminiLiveOrgId,
} from "@/lib/gemini-live/eligibility";
import { loadGeminiLiveVoiceSettings } from "@/lib/gemini-live-voice-settings";
import { GEMINI_LIVE_SESSION_START_TAG } from "@/lib/gemini-live/session-greeting";
import {
  getGeminiLiveRateLimitCooldownUntilMs,
  isGeminiLiveRateLimited,
} from "@/lib/gemini-live/rate-limit-cooldown";
import { formatGeminiLiveRateLimitMessage } from "@/lib/gemini-live-user-message";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";
import type { AutomationAction } from "@/lib/os-automations/types";
import { formatChatTime, type Message } from "@/components/os/widgets/ai-chat/types";
const LIVE_USER_DRAFT_ID = "app-builder-live-user";
const LIVE_ASSISTANT_DRAFT_ID = "app-builder-live-assistant";

function upsertLiveTranscriptMessage(
  prev: Message[],
  draftId: string,
  role: Message["role"],
  content: string,
  finished: boolean,
  locale: string,
): Message[] {
  const trimmed = content.trim();
  if (!trimmed || trimmed === GEMINI_LIVE_SESSION_START_TAG) return prev;
  const withoutDraft = prev.filter((m) => m.id !== draftId);
  const entry: Message = {
    id: finished ? `${role}-live-${Date.now()}` : draftId,
    role,
    content: role === "assistant" ? (getAssistantVisibleTranscript(trimmed) ?? trimmed) : trimmed,
    timestamp: formatChatTime(locale),
  };
  return [...withoutDraft, entry];
}

type UseAppBuilderAssistantOptions = {
  currentUiSchema: AppBuilderUiSchema | null;
  onSchemaApplied: (schema: AppBuilderUiSchema) => void;
};

export function useAppBuilderAssistant({ currentUiSchema, onSchemaApplied }: UseAppBuilderAssistantOptions) {
  const { t, locale } = useI18n();
  const { data: session } = useSession();
  const automationCtx = useAutomationRunnerContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatTab, setChatTab] = useState<"live" | "text">("text");
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [geminiVoiceSettings, setGeminiVoiceSettings] = useState<GeminiLiveVoiceSettings>(
    DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
  );
  const [showSettings, setShowSettings] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const liveAutoStartRef = useRef(false);
  const uiSchemaRef = useRef(currentUiSchema);
  uiSchemaRef.current = currentUiSchema;

  useEffect(() => {
    setGeminiVoiceSettings(loadGeminiLiveVoiceSettings());
  }, []);

  const osAssistant = useOsAssistant({ openWidget: () => {} });

  const geminiLiveFeatureEnabled = osAssistant.featureFlags.geminiLiveEnabled;
  useEffect(() => {
    if (geminiLiveFeatureEnabled === false) {
      setChatTab("text");
      setIsLiveMode(false);
    }
  }, [geminiLiveFeatureEnabled]);

  const liveStatusLabels = useMemo<GeminiLiveStatusLabels>(
    () => ({
      ready: t("workspaceWidgets.appBuilder.liveStatusReady"),
      connected: t("workspaceWidgets.appBuilder.liveStatusConnected"),
      listening: t("workspaceWidgets.appBuilder.liveStatusListening"),
      speaking: t("workspaceWidgets.appBuilder.liveStatusSpeaking"),
      interrupted: t("workspaceWidgets.appBuilder.liveStatusInterrupted"),
      tool: t("workspaceWidgets.appBuilder.liveStatusTool"),
      disconnected: t("workspaceWidgets.appBuilder.liveStatusDisconnected"),
      preparing: t("workspaceWidgets.appBuilder.liveStatusPreparing"),
      fallback: t("workspaceWidgets.appBuilder.liveStatusFallback"),
    }),
    [t],
  );

  const liveUserName = osAssistant.context?.user.name?.trim() || session?.user?.name?.trim() || undefined;
  const liveOrgId = resolveGeminiLiveOrgId(session?.user?.organizationId, osAssistant.context);
  const geminiLiveEligible =
    isGeminiLiveSessionEligible({
      userId: session?.user?.id,
      orgId: liveOrgId,
      platformEnabled: osAssistant.featureFlags.geminiLiveEnabled,
    }) && isGeminiLiveAllowedByContext(osAssistant.context);
  const liveContextReady = isGeminiLiveContextReady({
    assistantReady: osAssistant.ready,
    assistantLoading: osAssistant.loading,
    systemInstructionVoice: osAssistant.systemInstructionVoice,
    context: osAssistant.context,
  });

  const appBuilderLiveInstruction = useMemo(() => {
    const base = osAssistant.systemInstructionVoice?.trim() ?? "";
    return `${base}\n\n${APP_BUILDER_CHAT_SYSTEM_PROMPT}\n\nYou are in voice mode inside the App Builder. Give concise spoken advice about forms, tables, and dashboards. For applying UI changes, tell the user to describe the change clearly in text chat.`;
  }, [osAssistant.systemInstructionVoice]);

  const geminiLive = useGeminiLiveAudio({
    owner: "appBuilder",
    enabled: isLiveMode && geminiLiveEligible,
    contextReady: liveContextReady,
    systemInstruction: appBuilderLiveInstruction,
    settings: geminiVoiceSettings,
    advancedFeaturesEnabled: osAssistant.featureFlags.geminiLiveAdvancedFeatures,
    locale,
    userName: liveUserName,
    greetOnConnect: true,
    translate: t,
    statusLabels: liveStatusLabels,
    onUserTranscript: (text, finished) => {
      setMessages((prev) =>
        upsertLiveTranscriptMessage(prev, LIVE_USER_DRAFT_ID, "user", text, finished, locale),
      );
    },
    onModelTranscript: (text, finished) => {
      const visible = getAssistantVisibleTranscript(text) ?? text;
      if (!visible.trim()) return;
      setMessages((prev) =>
        upsertLiveTranscriptMessage(prev, LIVE_ASSISTANT_DRAFT_ID, "assistant", visible, finished, locale),
      );
    },
    shouldNotifyError: () => liveAutoStartRef.current,
    onError: (message) => {
      liveAutoStartRef.current = false;
      toast.error(message);
      if (isGeminiLiveRateLimited()) {
        setIsLiveMode(false);
      }
    },
  });

  const { isLiveActive, start, stop, acknowledgeContextReady } = geminiLive;

  useEffect(() => {
    if (!isLiveMode && isLiveActive) stop();
  }, [isLiveMode, isLiveActive, stop]);

  const beginLiveSession = useCallback(async () => {
    if (isGeminiLiveRateLimited()) {
      const untilMs = getGeminiLiveRateLimitCooldownUntilMs();
      const retryAt = untilMs != null ? new Date(untilMs) : new Date(Date.now() + 60_000);
      toast.error(formatGeminiLiveRateLimitMessage(retryAt, locale, t));
      return;
    }
    setIsLiveMode(true);
    const contextOk = liveContextReady || (await osAssistant.refresh());
    if (!contextOk) {
      toast.error(t("workspaceWidgets.aiChat.liveContextLoading"));
      return;
    }
    if (!geminiLiveEligible) {
      toast.error(t("workspaceWidgets.aiChat.liveFailed"));
      return;
    }
    liveAutoStartRef.current = true;
    acknowledgeContextReady();
    const ok = await start();
    if (!ok) liveAutoStartRef.current = false;
  }, [liveContextReady, osAssistant, geminiLiveEligible, start, acknowledgeContextReady, t, locale]);

  const handleLiveTab = () => {
    setChatTab("live");
    setIsLiveMode(true);
    liveAutoStartRef.current = true;
    void (async () => {
      await osAssistant.refresh();
      await beginLiveSession();
    })();
  };

  const handleTextTab = () => {
    setChatTab("text");
    setIsLiveMode(false);
    if (isLiveActive) stop();
  };

  const handleToggleLive = () => {
    if (isLiveActive) {
      stop();
      setIsLiveMode(false);
      liveAutoStartRef.current = false;
      return;
    }
    void beginLiveSession();
  };

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: trimmed,
        timestamp: formatChatTime(locale),
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/ai-builder/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale,
            currentUiSchema: uiSchemaRef.current,
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          uiSchema?: AppBuilderUiSchema;
          schemaError?: string;
          error?: string;
          clientActions?: AutomationAction[];
        };

        if (!res.ok) {
          throw new Error(data.error ?? "chat_failed");
        }

        const reply = data.reply?.trim() || t("workspaceWidgets.appBuilder.chatEmptyReply");
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: reply,
            timestamp: formatChatTime(locale),
          },
        ]);

        if (data.uiSchema) {
          onSchemaApplied(data.uiSchema);
        } else if (data.schemaError) {
          toast.error(t("workspaceWidgets.appBuilder.refineFailed"));
        }

        if (data.clientActions?.length && automationCtx?.runActions) {
          const results = await automationCtx.runActions(data.clientActions);
          const firstFail = results.find((r) => !r.ok);
          if (firstFail?.message) {
            toast.error(firstFail.message);
          }
        }      } catch {
        toast.error(t("workspaceWidgets.appBuilder.chatSendFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    [automationCtx, input, isLoading, locale, messages, onSchemaApplied, t],  );

  const voiceStatus: "idle" | "connecting" | "listening" | "speaking" | "error" =
    geminiLive.state === "connecting" || (chatTab === "live" && osAssistant.loading && !isLiveActive)
      ? "connecting"
      : geminiLive.state === "streaming"
        ? geminiLive.isSpeaking
          ? "speaking"
          : "listening"
        : geminiLive.state === "error"
          ? "error"
          : isLiveActive
            ? "listening"
            : "idle";

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    chatTab,
    chatEndRef,
    inputAreaRef,
    showSettings,
    setShowSettings,
    geminiVoiceSettings,
    setGeminiVoiceSettings,
    osAssistant,
    geminiLive,
    isLiveActive,
    voiceStatus,
    handleLiveTab,
    handleTextTab,
    handleToggleLive,
    handleSend,
  };
}
