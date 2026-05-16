"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useState } from 'react';
import { 
  Mic, 
  Send, 
  History, 
  Settings, 
  Sparkles,
  Command,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface AssistantCommand {
  id: string;
  query: string;
  response: string;
  status: 'success' | 'error';
  timestamp: string;
}

export default function GoogleAssistantWidget() {
  const { dir } = useI18n();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AssistantCommand[]>([]);

  const handleCommand = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    const currentQuery = query;
    setQuery('');

    try {
      const res = await fetch('/api/os/google-assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentQuery })
      });

      const data = await res.json();
      
      const newCommand: AssistantCommand = {
        id: Date.now().toString(),
        query: currentQuery,
        response: data.fulfillmentText || "בוצע בהצלחה",
        status: res.ok ? 'success' : 'error',
        timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      };

      setHistory(prev => [newCommand, ...prev]);
      
      if (!res.ok) throw new Error(data.error);
      
    } catch (error: any) {
      toast.error('שגיאה בביצוע פקודה: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      {/* Header */}
      <div className="p-4 border-b border-[color:var(--border-main)] flex items-center justify-between bg-[color:var(--background-main)]/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
            <Command size={24} />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest">Google Assistant</h3>
            <p className="text-[10px] text-[color:var(--foreground-muted)] font-bold">שליטה קולית וחכמה</p>
          </div>
        </div>
        <button className="p-2 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] transition-all">
          <Settings size={18} />
        </button>
      </div>

      {/* Input Area */}
      <div className="p-6 border-b border-[color:var(--border-main)] bg-gradient-to-b from-indigo-500/5 to-transparent">
        <form onSubmit={handleCommand} className="relative">
          <input 
            type="text"
            placeholder="הקלד פקודה ל-Assistant... (למשל: 'הדלק אורות')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl py-4 pr-6 pl-14 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] shadow-sm"
          />
          <button 
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute left-2 top-2 bottom-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-500/20 text-white rounded-xl transition-all flex items-center justify-center"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['מה השעה?', 'מזג האוויר', 'הדלק אורות', 'שים מוזיקה'].map((suggestion) => (
            <button 
              key={suggestion}
              onClick={() => { setQuery(suggestion); }}
              className="whitespace-nowrap px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-all"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4 px-2">
          <History size={14} className="text-[color:var(--foreground-muted)]" />
          <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">היסטוריית פקודות</span>
        </div>

        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 py-12">
            <Sparkles size={40} className="mb-4 text-indigo-500" />
            <p className="text-xs font-bold uppercase tracking-widest">אין פקודות אחרונות</p>
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="bg-[color:var(--surface-card)]/30 border border-[color:var(--border-main)] rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{item.query}</span>
                <span className="text-[9px] font-mono text-[color:var(--foreground-muted)]">{item.timestamp}</span>
              </div>
              <div className="flex items-center gap-2">
                {item.status === 'success' ? (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                ) : (
                  <AlertCircle size={14} className="text-rose-500" />
                )}
                <p className="text-sm text-[color:var(--foreground-main)] leading-relaxed">{item.response}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/30 flex items-center justify-between text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Assistant Active
        </div>
        <span>SDK Prototype v1</span>
      </div>
    </div>
  );
}
