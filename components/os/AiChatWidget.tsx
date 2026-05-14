import React, { useState, useEffect } from 'react';

interface AiChatProps {
  provider: string;
  prompt: string;
}

export default function AiChatWidget({ provider, prompt }: AiChatProps) {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChat = async () => {
      if (!provider || !prompt) {
        setResponse('אין בקשת AI תקפה להפעלה.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, prompt }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'שגיאת שרת');
        }

        setResponse(data.reply || 'לא התקבל תגובה מה-AI.');
      } catch (e) {
        setResponse('שגיאה בתקשורת עם השרת.');
      } finally {
        setLoading(false);
      }
    };

    fetchChat();
  }, [provider, prompt]);

  const engineColors: Record<string, string> = {
    gemini: 'bg-blue-400 text-blue-400 border-blue-500/30',
    openai: 'bg-emerald-400 text-emerald-400 border-emerald-500/30',
    claude: 'bg-orange-400 text-orange-400 border-orange-500/30',
    groq: 'bg-rose-400 text-rose-400 border-rose-500/30',
  };

  const themeColor = engineColors[provider] || engineColors.gemini;

  return (
    <div className="p-6 bg-transparent text-[color:var(--foreground-main)] rounded-2xl w-full h-full flex flex-col gap-4">
      <div className="flex justify-between items-center border-b border-[color:var(--border-main)] pb-3">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${themeColor.split(' ')[0]} animate-pulse shadow-[0_0_10px_currentColor]`} />
          <h2 className="text-xl font-bold capitalize text-[color:var(--foreground-main)]">
            {provider} <span className="text-[color:var(--foreground-muted)] font-normal text-sm">| AI Agent</span>
          </h2>
        </div>
      </div>

      <div className="bg-[color:var(--surface-card)]/50 p-4 rounded-xl border border-[color:var(--border-main)] italic">
        <p className="text-sm text-[color:var(--foreground-muted)]">&quot;{prompt}&quot;</p>
      </div>

      <div className={`flex-1 overflow-y-auto custom-scrollbar p-4 rounded-xl border bg-[color:var(--background-main)]/30 ${themeColor.split(' ')[2]} text-[color:var(--foreground-main)] text-sm leading-relaxed whitespace-pre-wrap`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[color:var(--foreground-muted)]">
            <div className={`w-6 h-6 border-2 ${themeColor.split(' ')[1].replace('text', 'border')} border-t-transparent rounded-full animate-spin`} />
            <span>המנוע מעבד את הבקשה...</span>
          </div>
        ) : (
          response
        )}
      </div>
    </div>
  );
}
