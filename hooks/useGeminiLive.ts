"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWindowManager } from '@/hooks/use-window-manager';

interface GeminiLiveOptions {
  apiKey: string;
  voice?: string;
  model?: string;
  onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting' | 'error') => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

export function useGeminiLive({ 
  apiKey, 
  voice = "Aoide", 
  model = "models/gemini-1.5-flash-8b-exp-0924",
  onStatusChange, 
  onSpeechStart, 
  onSpeechEnd 
}: GeminiLiveOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  
  const { openWidget } = useWindowManager();

  // Initialize Audio Context
  const initAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  }, []);

  // Play Audio Chunk
  const playAudioChunk = useCallback(async (base64Audio: string) => {
    await initAudio();
    const binaryString = window.atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Int16Array(len / 2);
    for (let i = 0; i < len; i += 2) {
      bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
    }
    
    audioQueueRef.current.push(bytes);
    if (!isPlayingRef.current) {
      processAudioQueue();
    }
  }, [initAudio]);

  const processAudioQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      onSpeechEnd?.();
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    onSpeechStart?.();

    const chunk = audioQueueRef.current.shift()!;
    const audioBuffer = audioContextRef.current.createBuffer(1, chunk.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < chunk.length; i++) {
      channelData[i] = chunk[i] / 32768.0;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => processAudioQueue();
    source.start();
  }, [onSpeechStart, onSpeechEnd]);

  // Connect to Gemini Live WebSocket
  const connect = useCallback(() => {
    if (wsRef.current) return;

    onStatusChange?.('connecting');
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      onStatusChange?.('connected');
      
      // Send Setup Message
      const setupMessage = {
        setup: {
          model: model,
          generation_config: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: { prebuilt_voice_config: { voice_name: voice } }
            }
          },
          system_instruction: {
            parts: [{ text: "אתה העוזר הקולי של BSD-YBM OS. דבר בעברית, קצר, מקצועי וענייני. יש לך גישה לכלים לפתיחת ווידג'טים במערכת." }]
          },
          tools: [{
            function_declarations: [
              {
                name: "execute_os_command",
                description: "מפעיל פקודות במערכת ההפעלה כמו פתיחת ווידג'טים",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    action: {
                      type: "STRING",
                      enum: ["crm", "meckanoReports", "projectBoard", "aiScanner", "erpArchive", "docCreator", "settings"],
                      description: "הווידג'ט לפתיחה"
                    }
                  },
                  required: ["action"]
                }
              }
            ]
          }]
        }
      };
      ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = async (event) => {
      const response = JSON.parse(event.data);
      
      if (response.serverContent) {
        const { modelTurn } = response.serverContent;
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            if (part.inlineData && part.inlineData.mimeType === 'audio/pcm;rate=24000') {
              playAudioChunk(part.inlineData.data);
            }
          }
        }
      }

      if (response.toolCall) {
        for (const call of response.toolCall.functionCalls) {
          if (call.name === 'execute_os_command') {
            const { action } = call.args;
            let result = "Success";
            
            // action is now directly the widget type
            openWidget(action as any);

            // Send Tool Response
            ws.send(JSON.stringify({
              tool_response: {
                function_responses: [{
                  name: "execute_os_command",
                  response: { result }
                }]
              }
            }));
          }
        }
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      onStatusChange?.('disconnected');
      wsRef.current = null;
    };

    ws.onerror = () => {
      setError("WebSocket error");
      onStatusChange?.('error');
    };
  }, [apiKey, onStatusChange, playAudioChunk, openWidget]);

  const disconnect = useCallback(() => {
    stopListening();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Start Recording Microphone
  const startListening = useCallback(async () => {
    if (!isConnected) connect();
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      await initAudio();
      const source = audioContextRef.current!.createMediaStreamSource(stream);
      const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        // Convert to Base64
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        
        wsRef.current.send(JSON.stringify({
          realtime_input: {
            media_chunks: [{
              mime_type: "audio/pcm;rate=24000",
              data: base64Data
            }]
          }
        }));
      };
      
      source.connect(processor);
      processor.connect(audioContextRef.current!.destination);
      processorRef.current = processor;
      setIsListening(true);
    } catch (err) {
      setError("Microphone access denied");
    }
  }, [isConnected, connect, initAudio]);

  const stopListening = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsListening(false);
  }, []);

  return {
    isConnected,
    isListening,
    isSpeaking,
    error,
    connect,
    disconnect,
    startListening,
    stopListening,
    toggleListening: () => isListening ? stopListening() : startListening()
  };
}
