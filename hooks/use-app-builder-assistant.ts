"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useAutomationRunnerContext } from "@/components/os/AutomationRunnerContext";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useGeminiLiveAudio, DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";
import type { GeminiLiveStatusLabels, GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { useOsAssistant } from "@/hooks/use-os-assistant";
import { getAssistantVisibleTranscript } from "@/lib/ai/filter-assistant-visible-text";
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
import { handleAppBuilderLiveToolCall } from "@/lib/app-builder/live-tool-handler";
import { isLikelyReactComponent } from "@/lib/app-builder/jsx-preview-utils";
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
  /** Called when the API returns a jsxCode string for Sandpack rendering */
  onCodeApplied?: (code: string) => void;
  /** Schema arrived but JSX generation failed — rebuild preview from schema */
  onRegeneratePreview?: (schema: AppBuilderUiSchema) => void;
};

export function useAppBuilderAssistant({
  currentUiSchema,
  onSchemaApplied,
  onCodeApplied,
  onRegeneratePreview,
}: UseAppBuilderAssistantOptions) {
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

  // מסלול ייעודי למחולל — פרומפט מכוון UI/JSX בלבד, ללא פעולות פלטפורמה.
  // הפרומפט נבנה בצד השרת; כאן אנו מעבירים רק את הגדרות הקול.
  const APP_BUILDER_LIVE_SESSION_URL = "/api/ai/gemini-live/app-builder-session";

  const handleLiveToolCall = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      let buildSucceeded = false;
      const result = await handleAppBuilderLiveToolCall(name, args, {
        locale,
        getCurrentUiSchema: () => uiSchemaRef.current,
        onCodeApplied,
        onSchemaApplied,
        onRegeneratePreview,
        t,
        onBuildReply: (reply) => {
          buildSucceeded = true;
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== LIVE_ASSISTANT_DRAFT_ID),
            {
              id: `assistant-live-build-${Date.now()}`,
              role: "assistant",
              content: reply,
              timestamp: formatChatTime(locale),
            },
          ]);
          toast.success(t("workspaceWidgets.appBuilder.liveBuildDone"));
        },
      });

      if (!buildSucceeded) {
        toast.error(result);
      }
      return result;
    },
    [locale, onCodeApplied, onRegeneratePreview, onSchemaApplied, t],
  );

  const geminiLive = useGeminiLiveAudio({
    owner: "appBuilder",
    enabled: isLiveMode && geminiLiveEligible,
    // contextReady: always true for the builder — no OS assistant context needed
    contextReady: true,
    // systemInstruction is built server-side in app-builder-session route; pass empty here.
    systemInstruction: "",
    sessionTokenUrl: APP_BUILDER_LIVE_SESSION_URL,
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
    onToolCall: handleLiveToolCall,
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

  /**
   * The build step. Its own request, so the model call gets a full 60s rather
   * than sharing one with the intent classification that precedes it.
   */
  const runBuild = useCallback(
    async (prompt: string, mode: "build" | "update") => {
      const res = await fetch("/api/ai-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          locale,
          mode,
          currentUiSchema: uiSchemaRef.current ?? undefined,
        }),
      });
      const body = (await res.json()) as {
        uiSchema?: AppBuilderUiSchema;
        jsxCode?: string;
        schemaError?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "build_failed");
      return body;
    },
    [locale],
  );

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
          pendingBuild?: { prompt: string; mode: "build" | "update" } | null;
          uiSchema?: AppBuilderUiSchema;
          jsxCode?: string;
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

        /**
         * The build is a second request on purpose. The chat route used to
         * classify intent and generate the UI in one invocation, which shares a
         * single 60s budget on Vercel and timed out on anything substantial —
         * the reply never arrived and the message just sat there.
         */
        const build = data.pendingBuild;
        const applied = build
          ? await runBuild(build.prompt, build.mode)
          : { jsxCode: data.jsxCode, uiSchema: data.uiSchema, schemaError: data.schemaError };

        const jsxCode = applied.jsxCode?.trim();
        if (jsxCode && isLikelyReactComponent(jsxCode)) {
          onCodeApplied?.(jsxCode);
        }
        if (applied.uiSchema) {
          onSchemaApplied(applied.uiSchema);
          if (!jsxCode && onRegeneratePreview) {
            onRegeneratePreview(applied.uiSchema);
          }
        } else if ((applied.schemaError || build) && !jsxCode) {
          toast.error(t("workspaceWidgets.appBuilder.refineFailed"));
        }

        /**
         * The live React preview is fetched afterwards, as an upgrade.
         *
         * The user already has a dashboard on screen at this point, rendered
         * from the schema. Asking for the JSX in the same request is what pushed
         * the build past Vercel's 60s ceiling — it is the expensive half — so it
         * gets its own invocation and simply does not arrive if it fails.
         */
        if (build && !jsxCode && onCodeApplied) {
          void fetch("/api/ai-builder/jsx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: build.prompt }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((body: { jsxCode?: string | null } | null) => {
              const code = body?.jsxCode?.trim();
              if (code && isLikelyReactComponent(code)) onCodeApplied(code);
            })
            .catch(() => {
              /* the schema-rendered dashboard stands on its own */
            });
        }

        if (data.clientActions?.length && automationCtx?.runActions) {
          const results = await automationCtx.runActions(data.clientActions);
          const firstFail = results.find((r) => !r.ok);
          if (firstFail?.message) {
            toast.error(firstFail.message);
          }
        }
      } catch {
        const failure = t("workspaceWidgets.appBuilder.chatSendFailed");
        toast.error(failure);
        // The toast disappears after a few seconds and the user is left staring
        // at their own message with no answer, which reads as "nothing
        // happened". Put the failure in the transcript, where it stays.
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: failure,
            timestamp: formatChatTime(locale),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [automationCtx, input, isLoading, locale, messages, onCodeApplied, onRegeneratePreview, onSchemaApplied, runBuild, t],
  );

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
