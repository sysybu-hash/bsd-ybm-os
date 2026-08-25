"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useEffect, useRef, useState } from "react";
import { Settings2, Trash2 } from "lucide-react";
import GeminiLiveSettingsSheet from "@/components/os/GeminiLiveSettingsSheet";
import GeminiLivePanel from "@/components/os/gemini-live/GeminiLivePanel";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import { OsIconButton } from "@/components/os/ui";
import { useAiChatState } from "./ai-chat/useAiChatState";
import { AiChatSidebar } from "./ai-chat/AiChatSidebar";
import { AiChatMessages } from "./ai-chat/AiChatMessages";
import { AiChatInput } from "./ai-chat/AiChatInput";
import type { AiChatFullWidgetProps } from "./ai-chat/types";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";

export default function AiChatFullWidget({ liveData = null, openWorkspaceWidget }: AiChatFullWidgetProps) {
  const { dir, t } = useI18n();
  const c = useAiChatState(liveData, openWorkspaceWidget);
  const [mobileViewport, setMobileViewport] = React.useState(
    () => typeof window !== "undefined" && isMobileViewport(),
  );
  React.useEffect(() => {
    const onResize = () => setMobileViewport(isMobileViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const inputAreaRef = useRef<HTMLDivElement>(null);

  // ── שעון שיחה — מתחיל כשנשלחת ההודעה הראשונה ──
  const [sessionStart] = useState(() => Date.now());
  // Only the clock reading is state; the label is formatted during render. The
  // old version wrote the formatted string from the effect, which meant the
  // first tick was published a render after it was taken.
  const [nowMs, setNowMs] = useState(sessionStart);
  const chatStarted = c.messages.length > 0;
  useEffect(() => {
    if (!chatStarted) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [chatStarted]);
  const elapsedSeconds = chatStarted ? Math.floor((nowMs - sessionStart) / 1000) : 0;
  const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(
    elapsedSeconds % 60,
  ).padStart(2, "0")}`;

  const chatArea = (
    <div className="flex min-h-0 flex-1 flex-col relative">
      {/* ── כותרת sticky — תמיד נראית, גם בגלילה ── */}
      <div className="sticky top-0 z-10 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/95 backdrop-blur-sm px-3 py-2 flex items-center gap-2">
        {/* טאבים */}
        <div className="flex items-center gap-1.5 min-w-0">
          {c.osAssistant.featureFlags.geminiLiveEnabled !== false ? (
            <button type="button" onClick={c.handleLiveTab} aria-pressed={c.chatTab === "live"}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition ${c.chatTab === "live" ? "bg-[color:var(--win-accent,var(--accent))] text-white" : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"}`}>
              {t("workspaceWidgets.aiChat.tabLive")}
            </button>
          ) : null}
          <button type="button" onClick={c.handleTextTab} aria-pressed={c.chatTab === "text"}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition ${c.chatTab === "text" ? "bg-[color:var(--win-accent,var(--accent))] text-white" : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"}`}>
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
          <OsIconButton label={t("workspaceWidgets.aiChat.chatSettings")} onClick={() => c.setShowSettings(true)}>
            <Settings2 size={17} aria-hidden />
          </OsIconButton>
          {/* סיום שיחה */}
          {c.messages.length > 0 && (
            <OsIconButton
              label={t("workspaceWidgets.aiChat.clearHistory")}
              onClick={() => c.setMessages([])}
              className="text-rose-500 hover:!border-rose-500/40 hover:!bg-rose-500/10"
            >
              <Trash2 size={17} aria-hidden />
            </OsIconButton>
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
        embedded={mobileViewport}
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
    <div
      {...(mobileViewport ? {} : { "data-widget-sticky-chrome": true })}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]"
      dir={dir}
    >
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
