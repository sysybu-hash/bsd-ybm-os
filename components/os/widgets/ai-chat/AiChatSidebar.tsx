"use client";

import React from "react";
import { MessageSquare, Sparkles, Trash2 } from "lucide-react";

type AiChatSidebarProps = {
  provider: "gemini" | "openai" | "claude";
  onSetProvider: (p: "gemini" | "openai" | "claude") => void;
  onClear: () => void;
  t: (key: string) => string;
};

export function AiChatSidebar({ provider, onSetProvider, onClear, t }: AiChatSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-6 border-b border-[color:var(--border-main)]">
        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-6">
          <Sparkles size={20} />
          <span className="font-black text-sm uppercase tracking-widest">{t("workspaceWidgets.aiChat.title")}</span>
        </div>
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest block mb-2">
            {t("workspaceWidgets.aiChat.activeEngine")}
          </span>
          {(["gemini", "openai", "claude"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onSetProvider(p)}
              className={`w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                provider === p
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shadow-sm"
                  : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] hover:bg-[color:var(--foreground-muted)]/5"
              }`}
            >
              <span className="capitalize">{p}</span>
              {provider === p && <div className="w-1.5 h-1.5 rounded-full bg-purple-500 dark:bg-purple-400 animate-pulse" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
        <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest px-2 block mb-4">
          {t("workspaceWidgets.aiChat.recentChats")}
        </span>
        <div className="space-y-1">
          {["ניתוח תקציב וילה", "השוואת מחירי בטון", "דרישות בטיחות אתר"].map((h, i) => (
            <button
              key={i}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[color:var(--foreground-muted)]/5 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] text-xs font-medium transition-all truncate text-right"
            >
              <MessageSquare size={14} className="flex-shrink-0" /> {h}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-[color:var(--border-main)]">
        <button
          onClick={onClear}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[color:var(--foreground-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/5 transition-all text-xs font-bold"
        >
          <Trash2 size={14} /> {t("workspaceWidgets.aiChat.clearHistory")}
        </button>
      </div>
    </div>
  );
}
