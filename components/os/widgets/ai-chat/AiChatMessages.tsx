"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";

import ReactMarkdown from "react-markdown";
import { getAssistantVisibleTranscript } from "@/lib/ai/filter-assistant-visible-text";
import type { Message } from "./types";

type AiChatMessagesProps = {
  messages: Message[];
  isLoading: boolean;
  chatTab: "live" | "text";
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  /** ref של קונטיינר שדה הקלט — לניטור נראות */
  inputRef?: React.RefObject<HTMLElement | null>;
  /** ערך הקלט הנוכחי — מוצג בבר הסטטוס */
  inputValue?: string;
  /** קריאה לשליחה מבר הסטטוס */
  onSubmit?: () => void;
  t: (key: string) => string;
  children?: React.ReactNode;
};

export function AiChatMessages({
  messages,
  isLoading,
  chatTab,
  chatEndRef,
  inputRef,
  inputValue = "",
  onSubmit,
  t,
  children,
}: AiChatMessagesProps) {
  const [inputVisible, setInputVisible] = useState(true);

  /** עקוב אחר נראות שדה הקלט */
  useEffect(() => {
    const el = inputRef?.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInputVisible(entry?.isIntersecting ?? true),
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inputRef]);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">

      {/* ── mini send bar — מוצג כשגוללים למעלה (קלט נעלם) ──
          הכותרת הקבועה כבר מציגה הגדרות + סיום שיחה.
          הבר מציג רק כפתור שלח מהיר כשיש טקסט מוקלד. ── */}
      {!inputVisible && inputValue.trim() && (
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[color:var(--border-main)]/60 bg-[color:var(--background-main)]/95 px-3 py-1.5 backdrop-blur-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${isLoading ? "animate-pulse bg-purple-500" : "bg-emerald-500"}`} />
          <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--foreground-muted)]">{inputValue}</span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isLoading}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-40"
          >
            <Send size={11} aria-hidden />
            {t("workspaceWidgets.omnibar.send")}
          </button>
        </div>
      )}

      {/* ── Message list ── */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 sm:p-6 space-y-4 sm:space-y-6">
        {children}

        {messages.length === 0 && chatTab === "text" && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <div className="w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center mb-6">
              <Bot size={40} className="text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-[color:var(--foreground-main)] mb-2">
              {t("workspaceWidgets.aiChat.emptyTitle")}
            </h3>
            <p className="text-sm text-[color:var(--foreground-muted)] max-w-xs leading-relaxed">
              {t("workspaceWidgets.aiChat.emptySubtitle")}
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                m.role === "user"
                  ? "bg-[color:var(--surface-card)]/50 border-[color:var(--border-main)] text-[color:var(--foreground-main)]"
                  : "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400"
              }`}
            >
              {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`flex flex-col max-w-[80%] ${m.role === "user" ? "items-end" : ""}`}>
              <div
                className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] rounded-tr-none shadow-sm dark:shadow-none"
                    : "bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] text-[color:var(--foreground-main)] rounded-tl-none prose dark:prose-invert prose-sm max-w-none shadow-sm dark:shadow-none"
                }`}
              >
                {m.role === "assistant" ? (
                  <ReactMarkdown>
                    {getAssistantVisibleTranscript(m.content) ?? m.content}
                  </ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
              <span className="text-[10px] text-[color:var(--foreground-muted)] mt-1.5 font-mono">
                {m.timestamp}
              </span>
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

        <div ref={chatEndRef as React.RefObject<HTMLDivElement>} />
      </div>
    </div>
  );
}
