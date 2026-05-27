"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useAutomationRunnerContext } from "@/components/os/AutomationRunnerContext";
import { useGeminiLiveAudio, DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";
import type { GeminiLiveStatusLabels, GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { useOsAssistant } from "@/hooks/use-os-assistant";
import type { WidgetType } from "@/hooks/use-window-manager";
import { loadGeminiLiveVoiceSettings } from "@/lib/gemini-live-voice-settings";
import { getAssistantVisibleTranscript } from "@/lib/ai/filter-assistant-visible-text";
import { GEMINI_LIVE_SESSION_START_TAG } from "@/lib/gemini-live/session-greeting";
import {
  isGeminiLiveAllowedByContext,
  isGeminiLiveContextReady,
  isGeminiLiveSessionEligible,
  resolveGeminiLiveOrgId,
} from "@/lib/gemini-live/eligibility";
import { toast } from "sonner";
import { formatGeminiLiveRateLimitMessage } from "@/lib/gemini-live-user-message";
import {
  getGeminiLiveRateLimitCooldownUntilMs,
  isGeminiLiveRateLimited,
} from "@/lib/gemini-live/rate-limit-cooldown";
import { formatChatTime, type Message } from "./types";

const LIVE_USER_DRAFT_ID = "gemini-live-user-draft";
const LIVE_ASSISTANT_DRAFT_ID = "gemini-live-assistant-draft";

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

export function useAiChatState(
  liveData: Record<string, unknown> | null | undefined,
  openWorkspaceWidget: ((type: WidgetType, data?: Record<string, unknown> | null) => void) | undefined,
) {
  const { t, locale } = useI18n();
  const { data: session } = useSession();
  const automationCtx = useAutomationRunnerContext();

  const openWidget = useCallback(
    (type: WidgetType, data?: Record<string, unknown> | null) => {
      if (openWorkspaceWidget) openWorkspaceWidget(type, data);
      else automationCtx?.assistantToolDeps.openWidget(type, data ?? null);
    },
    [openWorkspaceWidget, automationCtx?.assistantToolDeps],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<"gemini" | "openai" | "claude">("gemini");
  const [chatTab, setChatTab] = useState<"live" | "text">("text");
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [geminiVoiceSettings, setGeminiVoiceSettings] = useState<GeminiLiveVoiceSettings>(DEFAULT_GEMINI_LIVE_VOICE_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [attachment, setAttachment] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveAutoStartRef = useRef(false);

  useEffect(() => { setGeminiVoiceSettings(loadGeminiLiveVoiceSettings()); }, []);

  const assistantToolDeps = useMemo(
    () => automationCtx?.assistantToolDeps ?? { openWidget },
    [automationCtx?.assistantToolDeps, openWidget],
  );
  const osAssistant = useOsAssistant(assistantToolDeps);
  const refreshOsAssistant = osAssistant.refresh;

  // ── liveData effects ──────────────────────────────────────────────────────
  useEffect(() => {
    const prompt = liveData?.prompt;
    if (typeof prompt === "string" && prompt.trim()) setInput(prompt.trim());
    const p = liveData?.provider;
    if (p === "openai" || p === "claude" || p === "gemini") setProvider(p);
    if (liveData?.startLive === true) { setChatTab("live"); setIsLiveMode(true); }
  }, [liveData]);

  useEffect(() => {
    if (chatTab === "live" && session?.user?.id) void refreshOsAssistant({ force: true });
  }, [chatTab, session?.user?.id, refreshOsAssistant]);

  const geminiLiveFeatureEnabled = osAssistant.featureFlags.geminiLiveEnabled;
  useEffect(() => {
    if (geminiLiveFeatureEnabled === false) {
      setChatTab("text"); setIsLiveMode(false);
    }
  }, [geminiLiveFeatureEnabled]);

  // ── Gemini Live ───────────────────────────────────────────────────────────
  const liveStatusLabels = useMemo<GeminiLiveStatusLabels>(() => ({
    ready: t("workspaceWidgets.aiChat.liveStatusReady"),
    connected: t("workspaceWidgets.aiChat.liveStatusConnected"),
    listening: t("workspaceWidgets.aiChat.liveStatusListening"),
    speaking: t("workspaceWidgets.aiChat.liveStatusSpeaking"),
    interrupted: t("workspaceWidgets.aiChat.liveStatusInterrupted"),
    tool: t("workspaceWidgets.aiChat.liveStatusTool"),
    disconnected: t("workspaceWidgets.aiChat.liveStatusDisconnected"),
    preparing: t("workspaceWidgets.aiChat.liveStatusPreparing"),
    fallback: t("workspaceWidgets.aiChat.liveStatusFallback"),
  }), [t]);

  const liveUserName = osAssistant.context?.user.name?.trim() || session?.user?.name?.trim() || undefined;
  const liveOrgId = resolveGeminiLiveOrgId(session?.user?.organizationId, osAssistant.context);
  const geminiLiveEligible =
    isGeminiLiveSessionEligible({ userId: session?.user?.id, orgId: liveOrgId, platformEnabled: osAssistant.featureFlags.geminiLiveEnabled }) &&
    isGeminiLiveAllowedByContext(osAssistant.context);
  const liveContextReady = isGeminiLiveContextReady({
    assistantReady: osAssistant.ready,
    assistantLoading: osAssistant.loading,
    systemInstructionVoice: osAssistant.systemInstructionVoice,
    context: osAssistant.context,
  });

  const geminiLive = useGeminiLiveAudio({
    owner: "aiChatFull",
    enabled: (chatTab === "live" || isLiveMode) && geminiLiveEligible,
    contextReady: liveContextReady,
    systemInstruction: osAssistant.systemInstructionVoice,
    settings: geminiVoiceSettings,
    advancedFeaturesEnabled: osAssistant.featureFlags.geminiLiveAdvancedFeatures,
    locale,
    userName: liveUserName,
    greetOnConnect: true,
    translate: t,
    statusLabels: liveStatusLabels,
    onUserTranscript: (text, finished) => {
      setMessages((prev) => upsertLiveTranscriptMessage(prev, LIVE_USER_DRAFT_ID, "user", text, finished, locale));
    },
    onModelTranscript: (text, finished) => {
      const visible = getAssistantVisibleTranscript(text) ?? text;
      if (!visible.trim()) return;
      setMessages((prev) => upsertLiveTranscriptMessage(prev, LIVE_ASSISTANT_DRAFT_ID, "assistant", visible, finished, locale));
    },
    onToolCall: async (name, args) => {
      const result = await osAssistant.onToolCall(name, args);
      const text = typeof result === "string" ? result : "Success";
      if (text === "Success") toast.success(t("workspaceWidgets.omnibar.voiceActionDone"));
      else if (text && !text.startsWith("לא ") && !text.startsWith("שגיאה") && !text.toLowerCase().startsWith("error")) toast.success(text);
      return result;
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

  useEffect(() => { if (!isLiveMode && isLiveActive) stop(); }, [isLiveMode, isLiveActive, stop]);
  useEffect(() => {
    if (liveData?.startLive !== true || !isLiveMode || isLiveActive || !liveContextReady) return;
    if (isGeminiLiveRateLimited() || geminiLive.isRateLimited) return;
    liveAutoStartRef.current = true;
    void start();
  }, [
    liveData?.startLive,
    isLiveMode,
    isLiveActive,
    liveContextReady,
    geminiLive.isRateLimited,
    start,
  ]);
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleLiveTab = () => {
    setChatTab("live");
    setIsLiveMode(true);
    liveAutoStartRef.current = true;
    void (async () => {
      await osAssistant.refresh();
      await beginLiveSession();
    })();
  };
  const handleTextTab = () => { setChatTab("text"); setIsLiveMode(false); if (isLiveActive) stop(); };
  const handleToggleLive = () => {
    if (isLiveActive) { stop(); setIsLiveMode(false); liveAutoStartRef.current = false; return; }
    void beginLiveSession();
  };

  const handleAttachmentPick = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? (result.split(",")[1] ?? "") : result;
      setAttachment({ base64, mimeType: file.type || "application/octet-stream", name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !attachment) || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: attachment ? `${input.trim() || attachment.name} 📎` : input,
      timestamp: formatChatTime(locale),
    };
    setMessages((prev) => [...prev, userMsg]);
    const sentText = input.trim() || (attachment ? `נתח את הקובץ המצורף: ${attachment.name}` : "");
    const sentAttachment = attachment;
    setInput("");
    setAttachment(null);
    setIsLoading(true);

    try {
      if (!sentAttachment && automationCtx?.parseAndRun) {
        const parsed = await automationCtx.parseAndRun(sentText);
        if (parsed?.actions?.length) {
          if (parsed.reply?.trim()) {
            setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: parsed.reply, timestamp: formatChatTime(locale) }]);
          }
          return;
        }
      }

      const body: Record<string, unknown> = {
        provider, locale, prompt: sentText, stream: true,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      };
      if (sentAttachment) { body.attachmentBase64 = sentAttachment.base64; body.attachmentMimeType = sentAttachment.mimeType; }

      const res = await fetch("/api/chat/legacy", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") && res.body) {
        const assistantId = (Date.now() + 1).toString();
        setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: formatChatTime(locale) }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const data = JSON.parse(line.slice(6)) as { chunk?: string; done?: boolean; error?: string };
            if (data.error) throw new Error(data.error);
            if (data.chunk) setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + data.chunk } : m));
          }
        }
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: getAssistantVisibleTranscript(m.content) ?? m.content } : m));
        return;
      }

      const data = await res.json();
      if (res.ok) {
        const visible = getAssistantVisibleTranscript(String(data.reply ?? "")) ?? String(data.reply ?? "");
        setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: visible, timestamp: formatChatTime(locale) }]);
      } else {
        throw new Error(data.error);
      }
    } catch {
      toast.error(t("workspaceWidgets.aiChat.sendFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const voiceStatus: "idle" | "connecting" | "listening" | "speaking" | "error" =
    geminiLive.state === "connecting" || (chatTab === "live" && osAssistant.loading && !isLiveActive)
      ? "connecting"
    : geminiLive.state === "streaming" ? (geminiLive.isSpeaking ? "speaking" : "listening")
    : geminiLive.state === "error" ? "error"
    : isLiveActive ? "listening"
    : "idle";

  return {
    messages, setMessages,
    input, setInput,
    isLoading,
    provider, setProvider,
    chatTab, setChatTab,
    showSettings, setShowSettings,
    attachment, setAttachment,
    geminiVoiceSettings, setGeminiVoiceSettings,
    chatEndRef, fileInputRef,
    osAssistant,
    geminiLive, isLiveActive,
    voiceStatus,
    handleLiveTab, handleTextTab, handleToggleLive,
    handleAttachmentPick, handleSend,
  };
}
