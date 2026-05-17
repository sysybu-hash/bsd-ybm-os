"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatGeminiLiveUserMessage } from "@/lib/gemini-live-user-message";
import { getOsAssistantLiveToolDeclarations } from "@/lib/os-assistant/live-tools";

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
};

type GeminiLiveOptions = {
  enabled: boolean;
  systemInstruction: string;
  settings?: GeminiLiveVoiceSettings;
  onUserTranscript?: (text: string, finished: boolean) => void;
  onModelTranscript?: (text: string, finished: boolean) => void;
  onToolCall?: (name: string, args: any) => Promise<any> | any;
  onError?: (message: string) => void;
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
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(float32.length);
  for (let index = 0; index < float32.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32[index]));
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
    audio[index] = pcm[index] / 32768;
  }
  return audio;
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || win.webkitAudioContext || null;
}

export function useGeminiLiveAudio({
  enabled,
  systemInstruction,
  settings = DEFAULT_GEMINI_LIVE_VOICE_SETTINGS,
  onUserTranscript,
  onModelTranscript,
  onToolCall,
  onError,
}: GeminiLiveOptions) {
  const [state, setState] = useState<GeminiLiveState>("idle");
  const [statusText, setStatusText] = useState("Gemini Live ready");
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

  const cleanup = useCallback(() => {
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
        setStatusText("Gemini Live מחובר. אפשר לדבר.");
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
          setStatusText("מבצע פעולה במערכת...");
        }
      }

      const serverContent = message.serverContent;
      if (!serverContent) return;

      if (serverContent.interrupted) {
        playbackNodeRef.current?.port.postMessage("interrupt");
        latestModelTextRef.current = "";
        setStatusText("הדיבור הופסק, מקשיב להמשך.");
      }

      const inputText = serverContent.inputTranscription?.text?.trim();
      if (inputText) {
        setLastTranscript(inputText);
        onUserTranscript?.(inputText, Boolean(serverContent.inputTranscription?.finished));
      }

      const outputText = serverContent.outputTranscription?.text?.trim();
      if (outputText) {
        latestModelTextRef.current = outputText;
        if (serverContent.outputTranscription?.finished && outputText !== deliveredModelTextRef.current) {
          deliveredModelTextRef.current = outputText;
          onModelTranscript?.(outputText, true);
        }
      }

      const parts = serverContent.modelTurn?.parts ?? [];
      for (const part of parts) {
        if (part.text?.trim()) {
          latestModelTextRef.current = part.text.trim();
        }
        if (part.inlineData?.data) {
          const audio = base64PcmToFloat32(part.inlineData.data);
          playbackNodeRef.current?.port.postMessage(audio);
          setState("streaming");
          setIsModelSpeaking(true);
          setStatusText("Gemini Live speaking");
        }
      }

      if (serverContent.turnComplete) {
        const finalText = latestModelTextRef.current.trim();
        if (finalText && finalText !== deliveredModelTextRef.current) {
          deliveredModelTextRef.current = finalText;
          onModelTranscript?.(finalText, true);
        }
        setState("ready");
        setIsModelSpeaking(false);
        setStatusText("Gemini Live ready for next turn");
      }

    },
    [onModelTranscript, onUserTranscript, onToolCall],
  );

  const start = useCallback(async () => {
    if (!enabled) {
      setState("fallback");
      setStatusText("Gemini Live זמין אחרי התחברות ושיוך לארגון.");
      return false;
    }

    const AudioCtor = getAudioContextCtor();
    if (!AudioCtor || !navigator.mediaDevices?.getUserMedia || !("AudioWorkletNode" in window)) {
      setState("fallback");
      setStatusText("הדפדפן לא תומך ב-Live Audio מלא. עובר למצב תאימות.");
      return false;
    }

    cleanup();
    setState("connecting");
    setStatusText("מכין Gemini Live מאובטח...");

    try {
      const tokenResponse = await fetch("/api/ai/gemini-live/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
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
      await playbackContext.audioWorklet.addModule("/gemini-live/playback.worklet.js");
      const playbackNode = new AudioWorkletNode(playbackContext, "gemini-live-playback");
      const gainNode = playbackContext.createGain();
      gainNode.gain.value = 1;
      playbackNode.connect(gainNode);
      gainNode.connect(playbackContext.destination);
      playbackContextRef.current = playbackContext;
      playbackNodeRef.current = playbackNode;
      gainNodeRef.current = gainNode;

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
          setStatusText("Gemini Live נותק.");
        }
      };

      socket.send(
        JSON.stringify({
          setup: {
            model: `models/${resolvedModel}`,
            generationConfig: {
              responseModalities: settings.responseMode === "audio_text" ? ["AUDIO", "TEXT"] : ["AUDIO"],
              temperature: settings.temperature,
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: settings.voiceName },
                },
              },
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
          },
        }),
      );

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const captureContext = new AudioCtor({ sampleRate: 16000 });
      await captureContext.audioWorklet.addModule("/gemini-live/capture.worklet.js");
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

      setState("streaming");
      setStatusText("מקשיב דרך Gemini Live...");
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
  }, [cleanup, enabled, handleLiveMessage, model, onError, settings, state, systemInstruction]);

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
    setIsModelSpeaking(false);
    setStatusText("Gemini Live ready");
    setLastTranscript("");
    latestModelTextRef.current = "";
    deliveredModelTextRef.current = "";
  }, [cleanup]);

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
