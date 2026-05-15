"use client";

import React, { useState, useRef, useEffect } from 'react';
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
import { useGeminiLiveAudio, DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from '@/hooks/useGeminiLiveAudio';
import type { GeminiLiveVoiceSettings } from '@/hooks/useGeminiLiveAudio';
import { useOsAssistant } from '@/hooks/use-os-assistant';
import { useSession } from 'next-auth/react';
import { useWindowManager } from '@/hooks/use-window-manager';
import { loadGeminiLiveVoiceSettings } from '@/lib/gemini-live-voice-settings';
import GeminiLiveSettingsSheet from '@/components/os/GeminiLiveSettingsSheet';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function AiChatFullWidget() {
  const { data: session } = useSession();
  const { openWidget } = useWindowManager();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'claude'>('gemini');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [geminiVoiceSettings, setGeminiVoiceSettings] = useState<GeminiLiveVoiceSettings>(DEFAULT_GEMINI_LIVE_VOICE_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGeminiVoiceSettings(loadGeminiLiveVoiceSettings());
  }, []);

  const osAssistant = useOsAssistant({ openWidget });

  const geminiLive = useGeminiLiveAudio({
    enabled: isLiveMode && Boolean(session?.user?.id && session?.user?.organizationId),
    systemInstruction: osAssistant.systemInstructionVoice,
    settings: geminiVoiceSettings,
    onUserTranscript: (text, finished) => {
      if (finished) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'user',
          content: text,
          timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        }]);
      }
    },
    onModelTranscript: (text, finished) => {
      if (finished) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: text,
          timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        }]);
      }
    },
    onToolCall: osAssistant.onToolCall,
    onError: (err) => {
      console.error("Gemini Live Error:", err);
      toast.error('שגיאה בחיבור Gemini Live');
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

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider, 
          prompt: input,
          history: messages.map(m => ({ role: m.role, content: m.content }))
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        }]);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast.error('שגיאה בתקשורת עם ה-AI');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir="rtl">
      {/* Sidebar - Providers & History */}
      <div className="hidden md:flex w-64 border-l border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex-col">
        <div className="p-6 border-b border-[color:var(--border-main)]">
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-6">
            <Sparkles size={20} />
            <span className="font-black text-sm uppercase tracking-widest">AI Assistant</span>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest block mb-2">מנוע פעיל</span>
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
          <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest px-2 block mb-4">שיחות אחרונות</span>
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
            <Trash2 size={14} /> נקה היסטוריה
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
              {isLiveMode ? 'עצור Gemini Live' : 'הפעל Gemini Live'}
            </button>
            {isLiveMode && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isLiveActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
                  {isLiveActive ? 'מחובר' : 'מתחבר...'}
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
                {isSpeaking ? 'העוזר מדבר...' : isListening ? 'אני מקשיב...' : 'Gemini Live מוכן'}
              </h4>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                {isListening ? 'דבר בחופשיות' : 'לחץ על המיקרופון כדי להתחיל'}
              </p>
              
              {!isListening && isLiveActive && (
                <button 
                  onClick={start}
                  className="mt-8 px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl shadow-xl shadow-purple-900/20 transition-all transform hover:scale-105 active:scale-95"
                >
                  התחל לדבר
                </button>
              )}
            </div>
          )}

          {messages.length === 0 && !isLiveMode && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
              <div className="w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center mb-6">
                <Bot size={40} className="text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-[color:var(--foreground-main)] mb-2">במה אוכל לעזור היום?</h3>
              <p className="text-sm text-[color:var(--foreground-muted)] max-w-xs leading-relaxed">אני יכול לנתח נתונים פיננסיים, לעזור בניהול פרויקטים או לענות על שאלות מקצועיות.</p>
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
                    <ReactMarkdown>{m.content}</ReactMarkdown>
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
          <form onSubmit={handleSend} className="relative flex gap-3">
            <button type="button" className="p-3 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-xl text-[color:var(--foreground-muted)] transition-all shadow-sm dark:shadow-none">
              <Paperclip size={20} />
            </button>
            <div className="relative flex-1">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="שאל אותי הכל על הפרויקטים שלך..."
                className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl py-4 pr-6 pl-14 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] shadow-sm dark:shadow-none"
              />
              <button 
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute left-2 top-2 bottom-2 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-[color:var(--foreground-muted)]/20 disabled:text-[color:var(--foreground-muted)] text-white rounded-xl transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
          <div className="mt-3 flex justify-center gap-6 text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
            <span>תמיכה ב-Markdown</span>
            <span>•</span>
            <span>זיכרון רב-שלבי</span>
            <span>•</span>
            <span>מודע לנתונים</span>
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
