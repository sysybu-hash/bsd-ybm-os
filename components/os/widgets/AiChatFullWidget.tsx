"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useRef } from "react";
import { Settings2 } from "lucide-react";
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

  const chatArea = (
    <div className="flex min-h-0 flex-1 flex-col relative">
      {/* Tab header */}
      <div className="px-3 py-2 sm:px-6 sm:py-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/30 flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          {c.osAssistant.featureFlags.geminiLiveEnabled !== false ? (
            <button type="button" onClick={c.handleLiveTab}
              className={`px-3 py-1.5 rounded-lg text-xs font-black ${c.chatTab === "live" ? "bg-indigo-600 text-white" : "text-[color:var(--foreground-muted)]"}`}>
              {t("workspaceWidgets.aiChat.tabLive")}
            </button>
          ) : null}
          <button type="button" onClick={c.handleTextTab}
            className={`px-3 py-1.5 rounded-lg text-xs font-black ${c.chatTab === "text" ? "bg-purple-600 text-white" : "text-[color:var(--foreground-muted)]"}`}>
            {t("workspaceWidgets.aiChat.tabText")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => c.setShowSettings(true)}
          aria-label={t("workspaceWidgets.aiChat.chatSettings")}
          className="p-2 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] transition-all"
        >
          <Settings2 size={18} aria-hidden />
        </button>
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
