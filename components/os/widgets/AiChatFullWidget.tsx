"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useEffect, useRef, useState } from "react";
import { Settings2, Trash2 } from "lucide-react";
import GeminiLiveSettingsSheet from "@/components/os/GeminiLiveSettingsSheet";
import GeminiLivePanel from "@/components/os/gemini-live/GeminiLivePanel";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import { useAiChatState } from "./ai-chat/useAiChatState";
import { AiChatSidebar } from "./ai-chat/AiChatSidebar";
import { AiChatMessages } from "./ai-chat/AiChatMessages";
import { AiChatInput } from "./ai-chat/AiChatInput";
import type { AiChatFullWidgetProps } from "./ai-chat/types";

export default function AiChatFullWidget({ liveData = null, openWorkspaceWidget }: AiChatFullWidgetProps) {
  const { dir, t } = useI18n();
  const c = useAiChatState(liveData, openWorkspaceWidget);
  const inputAreaRef = useRef<HTMLDivElement>(null);

  // ── שעון שיחה — מתחיל כשנשלחת ההודעה הראשונה ──
  const [sessionStart] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState("00:00");
  useEffect(() => {
    if (c.messages.length === 0) { setElapsed("00:00"); return; }
    const tick = () => {
      const s = Math.floor((Date.now() - sessionStart) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setElapsed(`${mm}:${ss}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [c.messages.length, sessionStart]);

  const chatArea = (
    <div className="flex min-h-0 flex-1 flex-col relative">
      {/* ── כותרת sticky — תמיד נראית, גם בגלילה ── */}
      <div className="sticky top-0 z-10 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/95 backdrop-blur-sm px-3 py-2 flex items-center gap-2">
        {/* טאבים */}
        <div className="flex items-center gap-1.5 min-w-0">
          {c.osAssistant.featureFlags.geminiLiveEnabled !== false ? (
            <button type="button" onClick={c.handleLiveTab}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-black ${c.chatTab === "live" ? "bg-indigo-600 text-white" : "text-[color:var(--foreground-muted)]"}`}>
              {t("workspaceWidgets.aiChat.tabLive")}
            </button>
          ) : null}
          <button type="button" onClick={c.handleTextTab}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-black ${c.chatTab === "text" ? "bg-purple-600 text-white" : "text-[color:var(--foreground-muted)]"}`}>
            {t("workspaceWidgets.aiChat.tabText")}
          </button>
        </div>

        {/* שעון שיחה */}
        {c.messages.length > 0 && (
          <span className="flex-1 text-center font-mono text-[11px] font-bold text-[color:var(--foreground-muted)]">
            🕐 {elapsed}
          </span>
        )}

        {/* כפתורי ניהול */}
        <div className="flex shrink-0 items-center gap-1">
          {/* הגדרות Gemini */}
          <button
            type="button"
            onClick={() => c.setShowSettings(true)}
            aria-label={t("workspaceWidgets.aiChat.chatSettings")}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-1.5 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--foreground-muted)]/10"
          >
            <Settings2 size={17} aria-hidden />
          </button>
          {/* סיום שיחה */}
          {c.messages.length > 0 && (
            <button
              type="button"
              onClick={() => c.setMessages([])}
              aria-label={t("workspaceWidgets.aiChat.clearHistory")}
              title={t("workspaceWidgets.aiChat.clearHistory")}
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-500/10"
            >
              <Trash2 size={17} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <AiChatMessages
        messages={c.messages}
        isLoading={c.isLoading}
        chatTab={c.chatTab}
        chatEndRef={c.chatEndRef}
        inputRef={inputAreaRef}
        inputValue={c.input}
        onSubmit={() => void c.handleSend()}
        t={t}
      >
        {c.chatTab === "live" && (
          <GeminiLivePanel
            statusLabel={c.geminiLive.statusText}
            voiceStatus={c.voiceStatus}
            isLiveActive={c.isLiveActive}
            onToggleLive={c.handleToggleLive}
            onOpenSettings={() => c.setShowSettings(true)}
            lastTranscript={c.geminiLive.lastTranscript}
          />
        )}
      </AiChatMessages>

      {/* Text input */}
      {c.chatTab === "text" && (
        <AiChatInput
          input={c.input}
          setInput={c.setInput}
          isLoading={c.isLoading}
          attachment={c.attachment}
          onClearAttachment={() => c.setAttachment(null)}
          onAttachFile={c.handleAttachmentPick}
          onSubmit={(e) => void c.handleSend(e)}
          fileInputRef={c.fileInputRef}
          containerRef={inputAreaRef}
          t={t}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
      <div className="hidden min-h-0 flex-1 md:flex">
        <WidgetSplitPanels
          className="min-h-0 flex-1"
          panels={[
            {
              id: "ai-chat-sidebar",
              defaultSize: 28,
              minSize: 18,
              className: "flex min-h-0 min-w-0 flex-col border-l border-[color:var(--border-main)] bg-[color:var(--background-main)]/50",
              children: (
                <AiChatSidebar
                  provider={c.provider}
                  onSetProvider={c.setProvider}
                  onClear={() => c.setMessages([])}
                  t={t}
                />
              ),
            },
            {
              id: "ai-chat-main",
              defaultSize: 72,
              minSize: 40,
              className: "flex min-h-0 min-w-0 flex-col",
              children: chatArea,
            },
          ]}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:hidden">{chatArea}</div>

      <GeminiLiveSettingsSheet
        open={c.showSettings}
        onClose={() => c.setShowSettings(false)}
        value={c.geminiVoiceSettings}
        onChange={c.setGeminiVoiceSettings}
        isLiveActive={c.isLiveActive}
        advancedFeaturesEnabled={c.osAssistant.featureFlags.geminiLiveAdvancedFeatures}
      />
    </div>
  );
}
