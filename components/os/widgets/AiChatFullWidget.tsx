"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Send, 
  User, 
  Bot, 
  Loader2, 
  Trash2, 
  Copy, 
  MessageSquare,
  History,
  Settings2,
  ChevronLeft,
  Paperclip,
  Mic,
  MicOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { getAssistantVisibleTranscript } from '@/lib/ai/filter-assistant-visible-text';
import { useGeminiLiveAudio, DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from '@/hooks/useGeminiLiveAudio';
import type { GeminiLiveStatusLabels } from '@/hooks/useGeminiLiveAudio';
import type { GeminiLiveVoiceSettings } from '@/hooks/useGeminiLiveAudio';
import { useOsAssistant } from '@/hooks/use-os-assistant';
import { useSession } from 'next-auth/react';
import { useAutomationRunnerContext } from '@/components/os/AutomationRunnerContext';
import type { WidgetType } from '@/hooks/use-window-manager';
import { loadGeminiLiveVoiceSettings } from '@/lib/gemini-live-voice-settings';
import GeminiLiveSettingsSheet from '@/components/os/GeminiLiveSettingsSheet';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

type AiChatFullWidgetProps = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};

function formatChatTime(locale: string) {
  const tag = locale === 'he' ? 'he-IL' : locale === 'ru' ? 'ru-RU' : 'en-US';
  return new Date().toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });
}

export default function AiChatFullWidget({ liveData = null, openWorkspaceWidget }: AiChatFullWidgetProps) {
  const { dir, t, locale } = useI18n();
  const { data: session } = useSession();
  const automationCtx = useAutomationRunnerContext();
  const openWidget = openWorkspaceWidget ?? ((type: WidgetType, data?: Record<string, unknown> | null) => {
    automationCtx?.assistantToolDeps.openWidget(type, data ?? null);
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'claude'>('gemini');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [geminiVoiceSettings, setGeminiVoiceSettings] = useState<GeminiLiveVoiceSettings>(DEFAULT_GEMINI_LIVE_VOICE_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [attachment, setAttachment] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setGeminiVoiceSettings(loadGeminiLiveVoiceSettings());
  }, []);

  useEffect(() => {
    const prompt = liveData?.prompt;
    if (typeof prompt === "string" && prompt.trim()) setInput(prompt.trim());
    const p = liveData?.provider;
    if (p === "openai" || p === "claude" || p === "gemini") setProvider(p);
  }, [liveData]);

  const osAssistant = useOsAssistant(automationCtx?.assistantToolDeps ?? { openWidget });

  const liveStatusLabels = useMemo<GeminiLiveStatusLabels>(
    () => ({
      ready: t('workspaceWidgets.aiChat.liveStatusReady'),
      connected: t('workspaceWidgets.aiChat.liveStatusConnected'),
      listening: t('workspaceWidgets.aiChat.liveStatusListening'),
      speaking: t('workspaceWidgets.aiChat.liveStatusSpeaking'),
      interrupted: t('workspaceWidgets.aiChat.liveStatusInterrupted'),
      tool: t('workspaceWidgets.aiChat.liveStatusTool'),
      disconnected: t('workspaceWidgets.aiChat.liveStatusDisconnected'),
      preparing: t('workspaceWidgets.aiChat.liveStatusPreparing'),
      fallback: t('workspaceWidgets.aiChat.liveStatusFallback'),
    }),
    [t],
  );

  const geminiLive = useGeminiLiveAudio({
    enabled: isLiveMode && Boolean(session?.user?.id && session?.user?.organizationId),
    systemInstruction: osAssistant.systemInstructionVoice,
    settings: geminiVoiceSettings,
    statusLabels: liveStatusLabels,
    onUserTranscript: (text, finished) => {
      if (finished) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'user',
          content: text,
          timestamp: formatChatTime(locale),
        }]);
      }
    },
    onModelTranscript: (text, finished) => {
      if (finished) {
        const visible = getAssistantVisibleTranscript(text);
        if (!visible) return;
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: visible,
          timestamp: formatChatTime(locale),
        }]);
      }
    },
    onToolCall: osAssistant.onToolCall,
    onError: (err) => {
      console.error("Gemini Live Error:", err);
      toast.error(t("workspaceWidgets.aiChat.liveFailed"));
    }
  });

  const { isLiveActive, isListening, isSpeaking, start, stop } = geminiLive;

  useEffect(() => {
    if (isLiveMode && !isLiveActive) {
      start();
    } else if (!isLiveMode && isLiveActive) {
      stop();
    }
  }, [isLiveMode, isLiveActive, start, stop]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAttachmentPick = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      setAttachment({ base64, mimeType: file.type || "application/octet-stream", name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !attachment) || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: attachment ? `${input.trim() || attachment.name} 📎` : input,
      timestamp: formatChatTime(locale),
    };

    setMessages(prev => [...prev, userMsg]);
    const sentText = input.trim() || (attachment ? `נתח את הקובץ המצורף: ${attachment.name}` : "");
    const sentAttachment = attachment;
    setInput('');
    setAttachment(null);
    setIsLoading(true);

    try {
      if (!sentAttachment && automationCtx?.parseAndRun) {
        const parsed = await automationCtx.parseAndRun(sentText);
        if (parsed?.actions?.length) {
          if (parsed.reply?.trim()) {
            setMessages((prev) => [
              ...prev,
              {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: parsed.reply,
                timestamp: formatChatTime(locale),
              },
            ]);
          }
          return;
        }
      }

      const body: Record<string, unknown> = {
        provider,
        locale,
        prompt: sentText,
        stream: true,
        history: messages.map(m => ({ role: m.role, content: m.content })),
      };
      if (sentAttachment) {
        body.attachmentBase64 = sentAttachment.base64;
        body.attachmentMimeType = sentAttachment.mimeType;
      }

      const res = await fetch('/api/chat/legacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream') && res.body) {
        const assistantId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: formatChatTime(locale),
        }]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const data = JSON.parse(line.slice(6)) as { chunk?: string; done?: boolean; error?: string };
            if (data.error) throw new Error(data.error);
            if (data.chunk) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + data.chunk } : m,
              ));
            }
          }
        }
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: getAssistantVisibleTranscript(m.content) ?? m.content }
            : m,
        ));
        return;
      }

      const data = await res.json();
      if (res.ok) {
        const visible = getAssistantVisibleTranscript(String(data.reply ?? '')) ?? String(data.reply ?? '');
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: visible,
          timestamp: formatChatTime(locale),
        }]);
      } else {
        throw new Error(data.error);
      }
    } catch {
      toast.error(t("workspaceWidgets.aiChat.sendFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir={dir}>
      {/* Sidebar - Providers & History */}
      <div className="hidden md:flex w-64 border-l border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex-col">
        <div className="p-6 border-b border-[color:var(--border-main)]">
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-6">
            <Sparkles size={20} />
            <span className="font-black text-sm uppercase tracking-widest">{t('workspaceWidgets.aiChat.title')}</span>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest block mb-2">{t('workspaceWidgets.aiChat.activeEngine')}</span>
            {(['gemini', 'openai', 'claude'] as const).map(p => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  provider === p ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shadow-sm' : 'text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] hover:bg-[color:var(--foreground-muted)]/5'
                }`}
              >
                <span className="capitalize">{p}</span>
                {provider === p && <div className="w-1.5 h-1.5 rounded-full bg-purple-500 dark:bg-purple-400 animate-pulse" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest px-2 block mb-4">{t('workspaceWidgets.aiChat.recentChats')}</span>
          <div className="space-y-1">
            {['ניתוח תקציב וילה', 'השוואת מחירי בטון', 'דרישות בטיחות אתר'].map((h, i) => (
              <button key={i} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[color:var(--foreground-muted)]/5 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] text-xs font-medium transition-all truncate text-right">
                <MessageSquare size={14} className="flex-shrink-0" /> {h}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-[color:var(--border-main)]">
          <button 
            onClick={() => setMessages([])}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[color:var(--foreground-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/5 transition-all text-xs font-bold"
          >
            <Trash2 size={14} /> {t('workspaceWidgets.aiChat.clearHistory')}
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Chat Header with Live Toggle */}
        <div className="px-6 py-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/30 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsLiveMode(!isLiveMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                isLiveMode 
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' 
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              }`}
            >
              {isLiveMode ? <MicOff size={14} /> : <Mic size={14} />}
              {isLiveMode ? t('workspaceWidgets.aiChat.stopLive') : t('workspaceWidgets.aiChat.startLive')}
            </button>
            {isLiveMode && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isLiveActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
                  {isLiveActive ? t('workspaceWidgets.aiChat.connected') : t('workspaceWidgets.aiChat.connecting')}
                </span>
              </div>
            )}
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] transition-all"
          >
            <Settings2 size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {isLiveMode && (
            <div className="flex flex-col items-center justify-center py-12 bg-purple-500/5 rounded-[3rem] border border-purple-500/10 mb-8">
              <div className="relative mb-8">
                <div className={`absolute inset-0 rounded-full bg-purple-500/20 blur-2xl transition-all duration-500 ${isSpeaking || isListening ? 'scale-150 opacity-100' : 'scale-100 opacity-0'}`} />
                <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                  isSpeaking ? 'border-emerald-500 bg-emerald-500/10' : 
                  isListening ? 'border-purple-500 bg-purple-500/10' : 
                  'border-slate-300 dark:border-white/10'
                }`}>
                  {isSpeaking ? <Volume2 size={40} className="text-emerald-500 animate-pulse" /> : 
                   isListening ? <Mic size={40} className="text-purple-500 animate-bounce" /> : 
                   <MicOff size={40} className="text-slate-400" />}
                </div>
              </div>
              <h4 className="text-lg font-black text-white mb-2">
                {isSpeaking ? t('workspaceWidgets.aiChat.liveSpeaking') : isListening ? t('workspaceWidgets.aiChat.liveListening') : t('workspaceWidgets.aiChat.liveReady')}
              </h4>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                {isListening ? t('workspaceWidgets.aiChat.liveListening') : t('workspaceWidgets.aiChat.liveTapMic')}
              </p>
              
              {!isListening && isLiveActive && (
                <button 
                  onClick={start}
                  className="mt-8 px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl shadow-xl shadow-purple-900/20 transition-all transform hover:scale-105 active:scale-95"
                >
                  {t('workspaceWidgets.aiChat.startTalking')}
                </button>
              )}
            </div>
          )}

          {messages.length === 0 && !isLiveMode && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
              <div className="w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center mb-6">
                <Bot size={40} className="text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-[color:var(--foreground-main)] mb-2">{t('workspaceWidgets.aiChat.emptyTitle')}</h3>
              <p className="text-sm text-[color:var(--foreground-muted)] max-w-xs leading-relaxed">{t('workspaceWidgets.aiChat.emptySubtitle')}</p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                m.role === 'user' ? 'bg-[color:var(--surface-card)]/50 border-[color:var(--border-main)] text-[color:var(--foreground-main)]' : 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400'
              }`}>
                {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`flex flex-col max-w-[80%] ${m.role === 'user' ? 'items-end' : ''}`}>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] rounded-tr-none shadow-sm dark:shadow-none' 
                    : 'bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] text-[color:var(--foreground-main)] rounded-tl-none prose dark:prose-invert prose-sm max-w-none shadow-sm dark:shadow-none'
                }`}>
                  {m.role === 'assistant' ? (
                    <ReactMarkdown>{getAssistantVisibleTranscript(m.content) ?? m.content}</ReactMarkdown>
                  ) : (
                    m.content
                  )}
                </div>
                <span className="text-[10px] text-[color:var(--foreground-muted)] mt-1.5 font-mono">{m.timestamp}</span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Loader2 size={16} className="text-purple-600 dark:text-purple-400 animate-spin" />
              </div>
              <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] p-4 rounded-2xl rounded-tl-none">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 animate-bounce" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 bg-[color:var(--background-main)]/50 border-t border-[color:var(--border-main)]">
          {attachment ? (
            <div className="mb-2 flex items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
              <span className="truncate max-w-[240px]">{attachment.name}</span>
              <button type="button" onClick={() => setAttachment(null)} className="text-red-500 hover:underline">
                הסר
              </button>
            </div>
          ) : null}
          <form onSubmit={handleSend} className="relative flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => handleAttachmentPick(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-xl text-[color:var(--foreground-muted)] transition-all shadow-sm dark:shadow-none"
              aria-label="צרף קובץ"
            >
              <Paperclip size={20} />
            </button>
            <div className="relative flex-1">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("workspaceWidgets.aiChat.placeholder")}
                className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl py-4 pr-6 pl-14 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] shadow-sm dark:shadow-none"
              />
              <button 
                type="submit"
                disabled={isLoading || (!input.trim() && !attachment)}
                className="absolute left-2 top-2 bottom-2 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-[color:var(--foreground-muted)]/20 disabled:text-[color:var(--foreground-muted)] text-white rounded-xl transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
          <div className="mt-3 flex justify-center gap-6 text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
            <span>{t('workspaceWidgets.aiChat.footerMarkdown')}</span>
            <span>•</span>
            <span>{t('workspaceWidgets.aiChat.footerMemory')}</span>
            <span>•</span>
            <span>{t('workspaceWidgets.aiChat.footerDataAware')}</span>
          </div>
        </div>
      </div>

      <GeminiLiveSettingsSheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        value={geminiVoiceSettings}
        onChange={setGeminiVoiceSettings}
        isLiveActive={isLiveActive}
      />
    </div>
  );
}
