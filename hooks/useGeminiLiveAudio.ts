"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAssistantVisibleTranscript } from "@/lib/ai/filter-assistant-visible-text";
import { formatGeminiLiveUserMessage } from "@/lib/gemini-live-user-message";
import { getOsAssistantLiveToolDeclarations } from "@/lib/os-assistant/live-tools";
import { mergeTranscriptChunk } from "@/lib/gemini-live/merge-transcript-chunk";
import { buildGeminiLiveSessionStartUserTurn } from "@/lib/gemini-live/session-greeting";
import {
  acquireGeminiLiveLease,
  releaseGeminiLiveLease,
  type GeminiLiveOwner,
} from "@/lib/gemini-live/session-coordinator";

type GeminiLiveState = "idle" | "connecting" | "ready" | "streaming" | "fallback" | "error";

export type GeminiLiveVoiceSettings = {
  voiceName: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede";
  speechStyle: "masculine" | "feminine" | "neutral";
  temperature: number;
  silenceDurationMs: number;
  prefixPaddingMs: number;
  inputTranscription: boolean;
  outputTranscription: boolean;
  responseMode: "audio" | "audio_text";
  proactiveAudio: boolean;
  affectiveDialog: boolean;
  sessionResumptionEnabled: boolean;
};

export const DEFAULT_GEMINI_LIVE_VOICE_SETTINGS: GeminiLiveVoiceSettings = {
  voiceName: "Charon",
  speechStyle: "masculine",
  temperature: 0.7,
  silenceDurationMs: 1100,
  prefixPaddingMs: 350,
  inputTranscription: true,
  outputTranscription: true,
  responseMode: "audio",
  proactiveAudio: false,
  affectiveDialog: false,
  sessionResumptionEnabled: true,
};

export type GeminiLiveStatusKey =
  | "ready"
  | "connected"
  | "listening"
  | "speaking"
  | "interrupted"
  | "tool"
  | "disconnected"
  | "preparing"
  | "fallback";

export type GeminiLiveStatusLabels = Record<GeminiLiveStatusKey, string>;

/** גרסת worklet — עדכן כשמשנים את קבצי public/gemini-live (מניעת cache ישן) */
const GEMINI_LIVE_WORKLET_VERSION = "2";

const DEFAULT_STATUS_LABELS: GeminiLiveStatusLabels = {
  ready: "Gemini Live מוכן",
  connected: "Gemini Live מחובר. אפשר לדבר.",
  listening: "מקשיב דרך Gemini Live...",
  speaking: "העוזר מדבר...",
  interrupted: "הדיבור הופסק, מקשיב להמשך.",
  tool: "מבצע פעולה במערכת...",
  disconnected: "Gemini Live נותק.",
  preparing: "מכין Gemini Live מאובטח...",
  fallback: "Gemini Live זמין אחרי התחברות ושיוך לארגון.",
};

type GeminiLiveOptions = {
  enabled: boolean;
  /** מזהה מקור — רק מופע Live אחד פעיל במערכת */
  owner?: GeminiLiveOwner;
  systemInstruction: string;
  settings?: GeminiLiveVoiceSettings;
  /** מאפשר proactiveAudio / affectiveDialog (דגל פלטפורמה) */
  advancedFeaturesEnabled?: boolean;
  statusLabels?: Partial<GeminiLiveStatusLabels>;
  onUserTranscript?: (text: string, finished: boolean) => void;
  onModelTranscript?: (text: string, finished: boolean) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown;
  onError?: (message: string) => void;
  /** שפת ממשק — לברכת פתיחה */
  locale?: string;
  /** שם משתמש לברכה אישית */
  userName?: string;
  /** ברכה קולית מיד אחרי חיבור (ברירת מחדל: כן) */
  greetOnConnect?: boolean;
  /** כש-false — לא מתחיל חיבור (ממתין להקשר מערכת מהשרת) */
  contextReady?: boolean;
};

type TokenResponse = {
  token?: string;
  model?: string;
  error?: string;
  code?: string;
};

type LiveFunctionCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

type LiveResponse = {
  setupComplete?: unknown;
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string; finished?: boolean };
    modelTurn?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
        inlineData?: { data?: string; mimeType?: string };
        functionCall?: LiveFunctionCall;
      }>;
    };
  };
  toolCall?: { functionCalls?: LiveFunctionCall[] };
  error?: { message?: string };
};

function parseFunctionCallArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function collectLiveFunctionCalls(message: LiveResponse): LiveFunctionCall[] {
  const calls: LiveFunctionCall[] = [];
  const fromToolCall = message.toolCall?.functionCalls;
  if (Array.isArray(fromToolCall)) {
    calls.push(...fromToolCall);
  }
  const parts = message.serverContent?.modelTurn?.parts ?? [];
  for (const part of parts) {
    if (part.functionCall?.name) {
      calls.push(part.functionCall);
    }
  }
  return calls;
}

async function executeLiveToolCalls(
  calls: LiveFunctionCall[],
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown,
): Promise<Array<{ id?: string; name: string; response: { result: string } }>> {
  const responses: Array<{ id?: string; name: string; response: { result: string } }> = [];
  for (const call of calls) {
    const name = call.name?.trim();
    if (!name) continue;
    const args = parseFunctionCallArgs(call.args);
    const raw = await onToolCall(name, args);
    const result =
      typeof raw === "string" ? raw : raw == null ? "Success" : JSON.stringify(raw);
    if (process.env.NODE_ENV === "development") {
      console.info("[gemini-live] tool call", { name, args, result });
    }
    responses.push({
      id: call.id,
      name,
      response: { result: result || "Success" },
    });
  }
  return responses;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return window.btoa(binary);
}

function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(float32.length);
  for (let index = 0; index < float32.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32[index]!));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

function base64PcmToFloat32(base64Audio: string): Float32Array {
  const binary = window.atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const pcm = new Int16Array(bytes.buffer);
  const audio = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    audio[index] = pcm[index]! / 32768;
  }
  return audio;
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || win.webkitAudioContext || null;
}

async function resumeAudioContext(ctx: AudioContext | null | undefined) {
  if (!ctx || ctx.state === "closed") return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

function deliverModelTranscript(
  raw: string,
  deliveredRef: { current: string },
  onModelTranscript?: (text: string, finished: boolean) => void,
) {
  const visible = getAssistantVisibleTranscript(raw);
  if (!visible || visible === deliveredRef.current) return;
  deliveredRef.current = visible;
  onModelTranscript?.(visible, true);
}

function deliverUserTranscript(
  raw: string,
  deliveredRef: { current: string },
  onUserTranscript?: (text: string, finished: boolean) => void,
) {
  const text = raw.trim();
  if (!text || text === deliveredRef.current) return;
  deliveredRef.current = text;
  onUserTranscript?.(text, true);
}

function flushUserTranscriptTurn(
  latestUserTextRef: { current: string },
  deliveredUserTextRef: { current: string },
  onUserTranscript?: (text: string, finished: boolean) => void,
) {
  const finalUser = latestUserTextRef.current.trim();
  if (finalUser) {
    deliverUserTranscript(finalUser, deliveredUserTextRef, onUserTranscript);
  }
  latestUserTextRef.current = "";
  deliveredUserTextRef.current = "";
}

export function useGeminiLiveAudio({
  enabled,
  owner,
  systemInstruction,
  settings = DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
  advancedFeaturesEnabled = false,
  statusLabels: statusLabelsProp,
  onUserTranscript,
  onModelTranscript,
  onToolCall,
  onError,
  locale,
  userName,
  greetOnConnect = true,
  contextReady = true,
}: GeminiLiveOptions) {
  const statusLabels = useMemo(
    () => ({ ...DEFAULT_STATUS_LABELS, ...statusLabelsProp }),
    [statusLabelsProp],
  );
  const [state, setState] = useState<GeminiLiveState>("idle");
  const [statusText, setStatusText] = useState(statusLabels.ready);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [model, setModel] = useState("gemini-2.5-flash-native-audio-latest");
  const [lastTranscript, setLastTranscript] = useState("");

  const webSocketRef = useRef<WebSocket | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const latestModelTextRef = useRef("");
  const deliveredModelTextRef = useRef("");
  const latestUserTextRef = useRef("");
  const deliveredUserTextRef = useRef("");
  const greetingSentRef = useRef(false);
  const leaseIdRef = useRef<string | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (visibilityHandlerRef.current) {
      document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }
    webSocketRef.current?.close();
    webSocketRef.current = null;

    captureNodeRef.current?.disconnect();
    captureNodeRef.current?.port.close();
    captureNodeRef.current = null;

    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    playbackNodeRef.current?.disconnect();
    playbackNodeRef.current?.port.close();
    playbackNodeRef.current = null;

    gainNodeRef.current?.disconnect();
    gainNodeRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    void captureContextRef.current?.close();
    captureContextRef.current = null;

    void playbackContextRef.current?.close();
    playbackContextRef.current = null;

    greetingSentRef.current = false;
    if (leaseIdRef.current) {
      releaseGeminiLiveLease(leaseIdRef.current);
      leaseIdRef.current = null;
    }
    latestUserTextRef.current = "";
    deliveredUserTextRef.current = "";
    latestModelTextRef.current = "";
    deliveredModelTextRef.current = "";
  }, []);

  const handleLiveMessage = useCallback(
    async (event: MessageEvent) => {
      const raw =
        event.data instanceof Blob
          ? await event.data.text()
          : event.data instanceof ArrayBuffer
            ? new TextDecoder().decode(event.data)
            : String(event.data);

      let message: LiveResponse;
      try {
        message = JSON.parse(raw) as LiveResponse;
      } catch {
        return;
      }

      if ("error" in message && message.error?.message) {
        throw new Error(message.error.message);
      }

      if ("setupComplete" in message && message.setupComplete !== undefined) {
        setState("ready");
        setStatusText(statusLabels.connected);
        if (
          greetOnConnect &&
          !greetingSentRef.current &&
          webSocketRef.current?.readyState === WebSocket.OPEN
        ) {
          greetingSentRef.current = true;
          webSocketRef.current.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: buildGeminiLiveSessionStartUserTurn(locale, userName),
                      },
                    ],
                  },
                ],
                turnComplete: true,
              },
            }),
          );
        }
        return;
      }

      const pendingToolCalls = collectLiveFunctionCalls(message);
      if (pendingToolCalls.length > 0 && onToolCall) {
        const functionResponses = await executeLiveToolCalls(pendingToolCalls, onToolCall);
        if (functionResponses.length > 0 && webSocketRef.current?.readyState === WebSocket.OPEN) {
          webSocketRef.current.send(
            JSON.stringify({
              toolResponse: { functionResponses },
            }),
          );
          setStatusText(statusLabels.tool);
        }
      }

      const serverContent = message.serverContent;
      if (!serverContent) return;

      if (serverContent.interrupted) {
        playbackNodeRef.current?.port.postMessage("interrupt");
        flushUserTranscriptTurn(latestUserTextRef, deliveredUserTextRef, onUserTranscript);
        latestModelTextRef.current = "";
        deliveredModelTextRef.current = "";
        setIsModelSpeaking(false);
        void resumeAudioContext(playbackContextRef.current);
        setStatusText(statusLabels.interrupted);
      }

      const inputTrans = serverContent.inputTranscription;
      if (inputTrans?.text?.trim()) {
        latestUserTextRef.current = mergeTranscriptChunk(
          latestUserTextRef.current,
          inputTrans.text,
        );
        setLastTranscript(latestUserTextRef.current);
        onUserTranscript?.(latestUserTextRef.current, false);
        if (inputTrans.finished) {
          flushUserTranscriptTurn(latestUserTextRef, deliveredUserTextRef, onUserTranscript);
        }
      }

      const outputTrans = serverContent.outputTranscription;
      if (outputTrans?.text?.trim()) {
        latestModelTextRef.current = mergeTranscriptChunk(
          latestModelTextRef.current,
          outputTrans.text,
        );
        onModelTranscript?.(
          getAssistantVisibleTranscript(latestModelTextRef.current) || latestModelTextRef.current,
          false,
        );
        if (outputTrans.finished) {
          deliverModelTranscript(latestModelTextRef.current, deliveredModelTextRef, onModelTranscript);
          latestModelTextRef.current = "";
        }
      }

      const parts = serverContent.modelTurn?.parts ?? [];
      for (const part of parts) {
        if (part.thought) continue;
        if (part.text?.trim()) {
          latestModelTextRef.current = mergeTranscriptChunk(
            latestModelTextRef.current,
            part.text.trim(),
          );
          onModelTranscript?.(
            getAssistantVisibleTranscript(latestModelTextRef.current) || latestModelTextRef.current,
            false,
          );
        }
        if (part.inlineData?.data) {
          void resumeAudioContext(playbackContextRef.current);
          const audio = base64PcmToFloat32(part.inlineData.data);
          playbackNodeRef.current?.port.postMessage(audio);
          setState("streaming");
          setIsModelSpeaking(true);
          setStatusText(statusLabels.speaking);
        }
      }

      if (serverContent.turnComplete) {
        flushUserTranscriptTurn(latestUserTextRef, deliveredUserTextRef, onUserTranscript);
        const finalText = latestModelTextRef.current.trim();
        if (finalText) {
          deliverModelTranscript(finalText, deliveredModelTextRef, onModelTranscript);
          latestModelTextRef.current = "";
        }
        setState("ready");
        setIsModelSpeaking(false);
        setStatusText(statusLabels.ready);
      }

    },
    [greetOnConnect, locale, onModelTranscript, onUserTranscript, onToolCall, statusLabels, userName],
  );

  const start = useCallback(async () => {
    if (!enabled) {
      setState("fallback");
      setStatusText(statusLabels.fallback);
      return false;
    }
    if (!contextReady) {
      setState("idle");
      setStatusText(statusLabels.preparing);
      return false;
    }

    const AudioCtor = getAudioContextCtor();
    if (!AudioCtor || !navigator.mediaDevices?.getUserMedia || !("AudioWorkletNode" in window)) {
      setState("fallback");
      setStatusText("הדפדפן לא תומך ב-Live Audio מלא. עובר למצב תאימות.");
      return false;
    }

    cleanup();
    if (owner) {
      leaseIdRef.current = acquireGeminiLiveLease(owner, () => {
        cleanup();
        setState("idle");
        setIsModelSpeaking(false);
        setStatusText(statusLabels.ready);
      });
    }
    setState("connecting");
    setStatusText(statusLabels.preparing);

    try {
      const tokenResponse = await fetch("/api/ai/gemini-live/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          geminiLiveAdvancedFeatures: advancedFeaturesEnabled,
          locale,
        }),
      });
      const tokenData = (await tokenResponse.json().catch(() => ({}))) as TokenResponse;
      if (!tokenResponse.ok || !tokenData.token) {
        if (tokenResponse.status === 403) {
          throw new Error(
            tokenData.error ?? "Gemini Live זמין רק למשתמשים המשויכים לארגון. פנה למנהל המערכת.",
          );
        }
        if (tokenResponse.status === 401) {
          throw new Error(
            tokenData.error ?? "פג תוקף ההתחברות. התנתק והתחבר שוב כדי להשתמש בעוזר הקולי.",
          );
        }
        throw new Error(tokenData.error ?? "לא התקבל token עבור Gemini Live");
      }

      const resolvedModel = tokenData.model ?? model;
      setModel(resolvedModel);

      const playbackContext = new AudioCtor({ sampleRate: 24000 });
      await playbackContext.audioWorklet.addModule(
        `/gemini-live/playback.worklet.js?v=${GEMINI_LIVE_WORKLET_VERSION}`,
      );
      const playbackNode = new AudioWorkletNode(playbackContext, "gemini-live-playback");
      const gainNode = playbackContext.createGain();
      gainNode.gain.value = 1;
      playbackNode.connect(gainNode);
      gainNode.connect(playbackContext.destination);
      playbackContextRef.current = playbackContext;
      playbackNodeRef.current = playbackNode;
      gainNodeRef.current = gainNode;
      await resumeAudioContext(playbackContext);

      const onVisibility = () => {
        void resumeAudioContext(playbackContextRef.current);
        void resumeAudioContext(captureContextRef.current);
      };
      visibilityHandlerRef.current = onVisibility;
      document.addEventListener("visibilitychange", onVisibility);

      const serviceUrl =
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained` +
        `?access_token=${encodeURIComponent(tokenData.token)}`;
      const socket = new WebSocket(serviceUrl);
      webSocketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        const failTimer = window.setTimeout(() => reject(new Error("Gemini Live connection timeout")), 12_000);
        socket.onerror = () => {
          window.clearTimeout(failTimer);
          reject(new Error("Gemini Live WebSocket failed"));
        };
        socket.onopen = () => {
          window.clearTimeout(failTimer);
          resolve();
        };
      });

      socket.onmessage = (event) => {
        void handleLiveMessage(event).catch((error: unknown) => {
          const raw = error instanceof Error ? error.message : String(error);
          const friendly = formatGeminiLiveUserMessage(raw);
          setState("error");
          setStatusText(friendly);
          onError?.(friendly);
        });
      };
      socket.onclose = () => {
        if (state !== "idle") {
          setStatusText(statusLabels.disconnected);
        }
      };

      const setupPayload: Record<string, unknown> = {
        model: `models/${resolvedModel}`,
        generationConfig: {
          responseModalities: settings.responseMode === "audio_text" ? ["AUDIO", "TEXT"] : ["AUDIO"],
          temperature: settings.temperature,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: settings.voiceName },
            },
          },
          ...(advancedFeaturesEnabled && settings.affectiveDialog ? { enableAffectiveDialog: true } : {}),
        },
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: [{ functionDeclarations: getOsAssistantLiveToolDeclarations() }],
        ...(settings.inputTranscription ? { inputAudioTranscription: {} } : {}),
        ...(settings.outputTranscription ? { outputAudioTranscription: {} } : {}),
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            silenceDurationMs: settings.silenceDurationMs,
            prefixPaddingMs: settings.prefixPaddingMs,
          },
          turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
        },
      };
      if (advancedFeaturesEnabled && settings.proactiveAudio) {
        setupPayload.proactivity = { proactiveAudio: true };
      }
      if (settings.sessionResumptionEnabled) {
        setupPayload.sessionResumption = {};
      }

      socket.send(JSON.stringify({ setup: setupPayload }));

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const captureContext = new AudioCtor({ sampleRate: 16000 });
      await captureContext.audioWorklet.addModule(
        `/gemini-live/capture.worklet.js?v=${GEMINI_LIVE_WORKLET_VERSION}`,
      );
      const source = captureContext.createMediaStreamSource(mediaStream);
      const captureNode = new AudioWorkletNode(captureContext, "gemini-live-capture");
      captureNode.port.onmessage = (event) => {
        if (socket.readyState !== WebSocket.OPEN || event.data?.type !== "audio") return;
        const pcm = float32ToPcm16(event.data.data as Float32Array);
        socket.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                data: arrayBufferToBase64(pcm),
                mimeType: "audio/pcm;rate=16000",
              },
            },
          }),
        );
      };

      source.connect(captureNode);
      mediaStreamRef.current = mediaStream;
      captureContextRef.current = captureContext;
      sourceNodeRef.current = source;
      captureNodeRef.current = captureNode;
      await resumeAudioContext(captureContext);

      setState("streaming");
      setStatusText(statusLabels.listening);
      return true;
    } catch (error) {
      cleanup();
      const raw = error instanceof Error ? error.message : String(error);
      const friendly = formatGeminiLiveUserMessage(raw);
      setState("fallback");
      setStatusText(friendly);
      onError?.(friendly);
      return false;
    }
  }, [
    advancedFeaturesEnabled,
    cleanup,
    enabled,
    handleLiveMessage,
    model,
    onError,
    settings,
    state,
    statusLabels,
    systemInstruction,
    locale,
    contextReady,
    owner,
  ]);

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
    setIsModelSpeaking(false);
    setStatusText(statusLabels.ready);
    setLastTranscript("");
    latestModelTextRef.current = "";
    deliveredModelTextRef.current = "";
  }, [cleanup, statusLabels.ready]);

  useEffect(() => {
    if (!enabled) {
      if (state === "connecting" || state === "streaming" || state === "ready") {
        cleanup();
      }
      if (state !== "connecting" && state !== "streaming") {
        setState("idle");
        setStatusText(statusLabels.ready);
      }
      return;
    }
    if (contextReady && state === "fallback") {
      setState("idle");
      setStatusText(statusLabels.ready);
    }
  }, [cleanup, contextReady, enabled, state, statusLabels.ready]);

  useEffect(() => stop, [stop]);

  return {
    state,
    statusText,
    model,
    lastTranscript,
    isLiveActive: state === "connecting" || state === "ready" || state === "streaming",
    isListening: state === "streaming" && !isModelSpeaking,
    isSpeaking: state === "streaming" && isModelSpeaking,
    start,
    stop,
  };
}
