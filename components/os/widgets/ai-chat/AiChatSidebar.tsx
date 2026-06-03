"use client";

import React from "react";
import { MessageSquare, Sparkles, Trash2 } from "lucide-react";
import { StickyPanelHeader } from "@/components/ui/StickyPanelHeader";

type AiChatSidebarProps = {
  provider: "gemini" | "openai" | "claude";
  onSetProvider: (p: "gemini" | "openai" | "claude") => void;
  onClear: () => void;
  t: (key: string) => string;
};

export function AiChatSidebar({ provider, onSetProvider, onClear, t }: AiChatSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <StickyPanelHeader
        title={
          <span className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <Sparkles size={16} aria-hidden />
            <span className="font-black text-sm uppercase tracking-widest">
              {t("workspaceWidgets.aiChat.title")}
            </span>
          </span>
        }
      />

      {/* ── Engine selector ──────────────────────────────────────────── */}
      <div className="p-4 border-b border-border-main space-y-2">
        <span className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest block mb-2">
          {t("workspaceWidgets.aiChat.activeEngine")}
        </span>
        {(["gemini", "openai", "claude"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onSetProvider(p)}
            className={`w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              provider === p
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shadow-glass"
                : "text-foreground-muted hover:text-foreground-main hover:bg-surface-soft"
            }`}
          >
            <span className="capitalize">{p}</span>
            {provider === p && (
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 dark:bg-purple-400 animate-pulse" aria-hidden />
            )}
          </button>
        ))}
      </div>

      {/* ── Recent chats ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
        <span className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest px-2 block mb-4">
          {t("workspaceWidgets.aiChat.recentChats")}
        </span>
        <div className="space-y-1">
          {["ניתוח תקציב וילה", "השוואת מחירי בטון", "דרישות בטיחות אתר"].map((h) => (
            <button
              key={h}
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors truncate text-start text-foreground-muted hover:text-foreground-main hover:bg-surface-soft"
            >
              <MessageSquare size={14} className="shrink-0" aria-hidden /> {h}
            </button>
          ))}
        </div>
      </div>

      {/* ── Footer: clear history ────────────────────────────────────── */}
      <div className="p-3 border-t border-border-main">
        <button
          type="button"
          onClick={onClear}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-colors text-foreground-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-red-500/5"
        >
          <Trash2 size={14} aria-hidden />
          {t("workspaceWidgets.aiChat.clearHistory")}
        </button>
      </div>

    </div>
  );
}
