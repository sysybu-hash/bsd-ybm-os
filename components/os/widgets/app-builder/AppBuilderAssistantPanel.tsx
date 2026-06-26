"use client";

import { useRef } from "react";
import { Loader2, Send, Settings2, Trash2 } from "lucide-react";
import GeminiLiveSettingsSheet from "@/components/os/GeminiLiveSettingsSheet";
import GeminiLivePanel from "@/components/os/gemini-live/GeminiLivePanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import { AiChatMessages } from "@/components/os/widgets/ai-chat/AiChatMessages";
import { useAppBuilderAssistant } from "@/hooks/use-app-builder-assistant";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

type Props = {
  currentUiSchema: AppBuilderUiSchema | null;
  onSchemaApplied: (schema: AppBuilderUiSchema) => void;
  /** Called when the API returns jsxCode — passed straight to Sandpack */
  onCodeApplied?: (code: string) => void;
  /** Schema without JSX — trigger preview rebuild */
  onRegeneratePreview?: (schema: AppBuilderUiSchema) => void;
  /**
   * Embedded mode — renders without internal flex-1/overflow so the parent
   * scroll container handles all overflow. Pass to AiChatMessages too.
   */
  embedded?: boolean;
};

export default function AppBuilderAssistantPanel({
  currentUiSchema,
  onSchemaApplied,
  onCodeApplied,
  onRegeneratePreview,
  embedded = false,
}: Props) {
  const { t } = useI18n();
  const c = useAppBuilderAssistant({ currentUiSchema, onSchemaApplied, onCodeApplied, onRegeneratePreview });
  const inputAreaRef = useRef<HTMLDivElement>(null);

  const sectionClass = embedded
    ? "flex flex-col rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30 overflow-hidden"
    : "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30";

  return (
    <section className={sectionClass}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          {c.osAssistant.featureFlags.geminiLiveEnabled !== false ? (
            <button
              type="button"
              onClick={c.handleLiveTab}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${
                c.chatTab === "live" ? "bg-[color:var(--accent)] text-white" : "text-[color:var(--foreground-muted)]"
              }`}
            >
              {t("workspaceWidgets.appBuilder.tabLive")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={c.handleTextTab}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${
              c.chatTab === "text" ? "bg-[color:var(--accent)] text-white" : "text-[color:var(--foreground-muted)]"
            }`}
          >
            {t("workspaceWidgets.appBuilder.tabText")}
          </button>
        </div>

        <span className="hidden min-w-0 flex-1 truncate text-[11px] text-[color:var(--foreground-muted)] sm:inline">
          {t("workspaceWidgets.appBuilder.chatHint")}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => c.setShowSettings(true)}
            aria-label={t("workspaceWidgets.aiChat.chatSettings")}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--foreground-muted)]/10"
          >
            <Settings2 size={16} aria-hidden />
          </button>
          {c.messages.length > 0 ? (
            <button
              type="button"
              onClick={() => c.setMessages([])}
              aria-label={t("workspaceWidgets.appBuilder.clearChat")}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-500/10"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <AiChatMessages
        messages={c.messages}
        isLoading={c.isLoading}
        chatTab={c.chatTab}
        chatEndRef={c.chatEndRef}
        inputRef={inputAreaRef}
        inputValue={c.input}
        onSubmit={() => void c.handleSend()}
        emptyTitleKey="workspaceWidgets.appBuilder.chatEmptyTitle"
        emptySubtitleKey="workspaceWidgets.appBuilder.chatEmptySubtitle"
        t={t}
        embedded={embedded}
      >
        {c.chatTab === "live" ? (
          <GeminiLivePanel
            compact
            statusLabel={c.geminiLive.statusText}
            voiceStatus={c.voiceStatus}
            isLiveActive={c.isLiveActive}
            onToggleLive={c.handleToggleLive}
            onOpenSettings={() => c.setShowSettings(true)}
            lastTranscript={c.geminiLive.lastTranscript}
          />
        ) : null}
      </AiChatMessages>

      {c.chatTab === "text" ? (
        <div
          ref={inputAreaRef}
          className="shrink-0 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-3 sm:p-4"
        >
          <form onSubmit={(e) => void c.handleSend(e)} className="flex gap-2">
            <input
              type="text"
              value={c.input}
              onChange={(e) => c.setInput(e.target.value)}
              placeholder={t("workspaceWidgets.appBuilder.chatPlaceholder")}
              disabled={c.isLoading}
              className="min-w-0 flex-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={c.isLoading || !c.input.trim()}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)] px-3 py-2.5 text-white transition hover:bg-indigo-500 disabled:opacity-60"
              aria-label={t("workspaceWidgets.appBuilder.chatSend")}
            >
              {c.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4 rtl:rotate-180" aria-hidden />
              )}
            </button>
          </form>
        </div>
      ) : null}

      <GeminiLiveSettingsSheet
        open={c.showSettings}
        onClose={() => c.setShowSettings(false)}
        value={c.geminiVoiceSettings}
        onChange={c.setGeminiVoiceSettings}
        isLiveActive={c.isLiveActive}
        advancedFeaturesEnabled={c.osAssistant.featureFlags.geminiLiveAdvancedFeatures}
      />
    </section>
  );
}
