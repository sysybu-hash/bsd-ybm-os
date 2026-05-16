"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";

interface AiChatProps {
  provider: string;
  prompt: string;
}

export default function AiChatWidget({ provider, prompt }: AiChatProps) {
  const { t } = useI18n();
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(true);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v !== key ? v : fallback;
    },
    [t],
  );

  useEffect(() => {
    const fetchChat = async () => {
      if (!provider || !prompt) {
        setResponse(tr("scanner.chatInvalid", "אין בקשת AI תקפה להפעלה."));
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, prompt }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || tr("scanner.chatServerError", "שגיאת שרת"));
        }

        setResponse(data.reply || tr("scanner.chatNoReply", "לא התקבלה תגובה מה-AI."));
      } catch {
        setResponse(tr("scanner.chatNetworkError", "שגיאה בתקשורת עם השרת."));
      } finally {
        setLoading(false);
      }
    };

    void fetchChat();
  }, [provider, prompt, tr]);

  const engineColors: Record<string, string> = {
    gemini: "bg-blue-400 text-blue-400 border-blue-500/30",
    openai: "bg-emerald-400 text-emerald-400 border-emerald-500/30",
    claude: "bg-orange-400 text-orange-400 border-orange-500/30",
    groq: "bg-rose-400 text-rose-400 border-rose-500/30",
  };

  const themeColor = engineColors[provider] || engineColors.gemini;

  return (
    <div className="flex h-full w-full flex-col gap-4 rounded-2xl bg-transparent p-6 text-[color:var(--foreground-main)]">
      <div className="flex items-center justify-between border-b border-[color:var(--border-main)] pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`h-3 w-3 rounded-full ${themeColor.split(" ")[0]} animate-pulse shadow-[0_0_10px_currentColor]`}
          />
          <h2 className="text-xl font-bold capitalize text-[color:var(--foreground-main)]">
            {provider}{" "}
            <span className="text-sm font-normal text-[color:var(--foreground-muted)]">| AI Agent</span>
          </h2>
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-4 italic">
        <p className="text-sm text-[color:var(--foreground-muted)]">&quot;{prompt}&quot;</p>
      </div>

      <div
        className={`custom-scrollbar flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-[color:var(--background-main)]/30 p-4 text-sm leading-relaxed text-[color:var(--foreground-main)] ${themeColor.split(" ")[2]}`}
      >
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[color:var(--foreground-muted)]">
            <div
              className={`h-6 w-6 animate-spin rounded-full border-2 ${themeColor.split(" ")[1].replace("text", "border")} border-t-transparent`}
            />
            <span>{tr("scanner.processing", "המנוע מעבד את הבקשה...")}</span>
          </div>
        ) : (
          response
        )}
      </div>
    </div>
  );
}
