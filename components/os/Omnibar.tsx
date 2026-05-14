import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, Loader2, Sparkles } from 'lucide-react';
import { useGeminiLiveAudio } from '@/hooks/useGeminiLiveAudio';
import { useWindowManager } from '@/hooks/use-window-manager';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';

interface OmnibarProps {
  onCommand: (cmd: string) => void | Promise<void>;
  apiLatency?: number | null;
  isBusy?: boolean;
  status?: 'ready' | 'fetching' | 'error';
  message?: string;
  onSearchPreview?: (query: string) => void;
  searchResults?: any[];
  onSelectResult?: (result: any) => void;
}

export default function Omnibar({ 
  onCommand, 
  apiLatency, 
  isBusy = false, 
  status = 'ready', 
  message = '',
  onSearchPreview,
  searchResults = [],
  onSelectResult
}: OmnibarProps) {
  const { data: session } = useSession();
  const { openWidget } = useWindowManager();
  const [input, setInput] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking' | 'error'>('idle');

  const geminiLive = useGeminiLiveAudio({
    enabled: !!session?.user,
    systemInstruction: "אתה העוזר הקולי של BSD-YBM OS. דבר בעברית, קצר, מקצועי וענייני. יש לך גישה לכלים לפתיחת ווידג'טים במערכת. הווידג'טים הזמינים: projectBoard, crmTable, erpArchive, docCreator, aiScanner, aiChatFull, settings, meckanoReports, googleDrive, googleAssistant.",
    onToolCall: async (name, args) => {
      if (name === 'execute_os_command') {
        openWidget(args.action);
        return "Success";
      }
      if (name === 'google_assistant_command') {
        try {
          const res = await fetch('/api/os/google-assistant/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: args.query })
          });
          const data = await res.json();
          return data.fulfillmentText || "Success";
        } catch (err) {
          console.error("Google Assistant Tool Error:", err);
          return "Error executing Google Assistant command";
        }
      }
    },
    onError: (err) => {
      console.error("Gemini Live Error:", err);
      setVoiceStatus('error');
    }
  });

  useEffect(() => {
    if (geminiLive.state === 'connecting') setVoiceStatus('connecting');
    else if (geminiLive.state === 'streaming') {
      // In useGeminiLiveAudio, streaming means it's active. 
      // We can check statusText to see if it's responding or listening.
      if (geminiLive.statusText.includes('משיב')) setVoiceStatus('speaking');
      else setVoiceStatus('listening');
    }
    else if (geminiLive.state === 'ready') setVoiceStatus('listening');
    else if (geminiLive.state === 'error') setVoiceStatus('error');
    else setVoiceStatus('idle');
  }, [geminiLive.state, geminiLive.statusText]);

  const handleInputChange = (val: string) => {
    setInput(val);
    if (onSearchPreview) {
      onSearchPreview(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      await onCommand(input);
      setInput('');
    }
  };

  const statusLabel = isBusy
    ? 'Analyzing'
    : typeof apiLatency === 'number'
      ? `${Math.round(apiLatency)}ms`
      : 'Ready';

  return (
    <div className="w-full px-0 md:px-4 z-50" dir="rtl">
      <form onSubmit={handleSubmit} className="relative">
        {/* Voice Visualizer Overlay */}
        <AnimatePresence>
          {(voiceStatus === 'listening' || voiceStatus === 'speaking') && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 -z-10 rounded-xl overflow-hidden"
            >
              <div className={`absolute inset-0 transition-colors duration-500 ${
                voiceStatus === 'speaking' ? 'bg-indigo-500/10' : 'bg-emerald-500/5'
              }`} />
              <div className="absolute bottom-0 left-0 right-0 h-1 flex items-end justify-center gap-1 px-4">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      height: voiceStatus === 'speaking' 
                        ? [4, Math.random() * 24 + 8, 4] 
                        : [2, Math.random() * 8 + 2, 2] 
                    }}
                    transition={{ 
                      repeat: Infinity, 
                      duration: 0.5 + Math.random() * 0.5,
                      ease: "easeInOut"
                    }}
                    className={`w-1 rounded-full ${
                      voiceStatus === 'speaking' ? 'bg-indigo-500' : 'bg-emerald-500/50'
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="hidden md:flex absolute right-4 top-1/2 z-10 -translate-y-1/2 items-center gap-2 rounded-full border border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 px-3 py-1 text-[10px] text-[color:var(--foreground-muted)] backdrop-blur-md">
          <span className={`h-1.5 w-1.5 rounded-full ${
            voiceStatus !== 'idle' ? 'animate-pulse bg-indigo-500' :
            isBusy ? 'animate-pulse bg-amber-400' : 
            status === 'error' ? 'bg-rose-500' : 
            'bg-emerald-500'
          }`} />
          <span dir="ltr">
            {voiceStatus === 'connecting' ? 'AI Connecting...' :
             voiceStatus === 'listening' ? 'AI Listening...' :
             voiceStatus === 'speaking' ? 'AI Speaking...' :
             `OS ${statusLabel}`}
          </span>
        </div>

        <input
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={voiceStatus !== 'idle' ? 'העוזר הקולי פעיל... דבר אליו' : 'הקלד פקודה (למשל: &quot;פרויקט הרצליה&quot;)...'}
          className={`w-full bg-[color:var(--background-main)]/40 border border-[color:var(--border-main)] text-[color:var(--foreground-main)] rounded-xl px-4 md:px-6 py-3.5 pr-4 md:pr-32 pl-24 md:pl-28 backdrop-blur-md shadow-2xl focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all text-sm placeholder:text-[color:var(--foreground-muted)] opacity-80 ${
            voiceStatus !== 'idle' ? 'ring-2 ring-indigo-500/20' : ''
          }`}
        />

        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {/* Voice Assistant Toggle */}
          <button
            type="button"
            onClick={() => geminiLive.isLiveActive ? geminiLive.stop() : geminiLive.start()}
            className={`p-2 rounded-lg transition-all flex items-center justify-center ${
              voiceStatus === 'listening' || voiceStatus === 'speaking'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40'
                : 'bg-[color:var(--surface-card)]/50 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] border border-[color:var(--border-main)]'
            }`}
            title={voiceStatus !== 'idle' ? 'כבה עוזר קולי' : 'הפעל עוזר קולי'}
          >
            {voiceStatus === 'connecting' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : voiceStatus === 'speaking' ? (
              <Volume2 size={18} className="animate-pulse" />
            ) : voiceStatus === 'listening' ? (
              <Mic size={18} className="animate-pulse" />
            ) : (
              <Mic size={18} />
            )}
          </button>

          <button 
            type="submit" 
            className="bg-indigo-600/80 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg transition-all text-xs font-bold shadow-lg shadow-indigo-500/20"
          >
            שלח
          </button>
        </div>
      </form>

      {/* Search Preview Results */}
      {searchResults.length > 0 && input.trim() && (
        <div className="absolute bottom-full mb-3 w-[calc(100%-2rem)] bg-[color:var(--glass-bg)] border border-[color:var(--border-main)] rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl">
          {searchResults.map((result, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (onSelectResult) onSelectResult(result);
                setInput('');
              }}
              className="w-full flex items-center justify-between p-4 hover:bg-[color:var(--foreground-muted)]/5 border-b border-[color:var(--border-main)]/30 last:border-0 transition-colors text-right"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  result.type === 'contact' ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                }`}>
                  <span className="text-[10px] font-bold uppercase">{result.type === 'contact' ? 'CRM' : 'PRJ'}</span>
                </div>
                <div>
                  <div className="text-xs font-bold text-[color:var(--foreground-main)]">{result.name}</div>
                  {result.taxId && <div className="text-[10px] text-[color:var(--foreground-muted)]">ח&quot;פ: {result.taxId}</div>}
                </div>
              </div>
              <div className="text-[10px] text-[color:var(--foreground-muted)] font-mono opacity-70">
                {Math.round(result.relevance * 100)}% Match
              </div>
            </button>
          ))}
        </div>
      )}

      {message ? (
        <div className="mt-3 rounded-xl bg-[color:var(--background-main)]/60 border border-[color:var(--border-main)] px-4 py-2 text-[11px] text-[color:var(--foreground-muted)] shadow-xl backdrop-blur-md text-center">
          {message}
        </div>
      ) : null}
    </div>
  );
}
