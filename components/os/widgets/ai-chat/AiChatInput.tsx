"use client";

import React from "react";
import { Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import KnowledgeVaultAttachButton from "@/components/os/knowledge-vault/KnowledgeVaultAttachButton";

type AiChatInputProps = {
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  attachment: { name: string } | null;
  onClearAttachment: () => void;
  onAttachFile: (file: File | null) => void;
  onSubmit: (e?: React.FormEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  t: (key: string) => string;
};

export function AiChatInput({
  input, setInput, isLoading, attachment, onClearAttachment,
  onAttachFile, onSubmit, fileInputRef, t,
}: AiChatInputProps) {
  return (
    <div className="p-6 bg-[color:var(--background-main)]/50 border-t border-[color:var(--border-main)]">
      {attachment ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
          <span className="truncate max-w-[240px]">{attachment.name}</span>
          <button
            type="button"
            onClick={onClearAttachment}
            className="text-red-500 hover:underline"
            aria-label={t("workspaceWidgets.aiChat.removeAttachment")}
          >
            {t("workspaceWidgets.aiChat.removeAttachment")}
          </button>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="relative flex gap-3">
        <input
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onAttachFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-3 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-xl text-[color:var(--foreground-muted)] transition-all shadow-sm dark:shadow-none"
          aria-label={t("workspaceWidgets.aiChat.attachFile")}
        >
          <Paperclip size={20} />
        </button>
        <KnowledgeVaultAttachButton
          onSelect={(item) => {
            if (item.parsedSummary && typeof item.parsedSummary === "object") {
              const text = (item.parsedSummary as { textPreview?: string }).textPreview;
              if (text) setInput(input ? `${input}\n\n${text}` : text);
            }
            toast.success(item.name);
          }}
        />
        <div className="relative flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("workspaceWidgets.aiChat.placeholder")}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl py-4 pr-6 pl-14 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] shadow-sm dark:shadow-none"
          />
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && !attachment)}
            aria-label={t("workspaceWidgets.aiChat.sendMessage")}
            className="absolute left-2 top-2 bottom-2 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-[color:var(--foreground-muted)]/20 disabled:text-[color:var(--foreground-muted)] text-white rounded-xl transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center"
          >
            <Send size={18} aria-hidden />
          </button>
        </div>
      </form>
      <div className="mt-3 flex justify-center gap-6 text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
        <span>{t("workspaceWidgets.aiChat.footerMarkdown")}</span>
        <span>•</span>
        <span>{t("workspaceWidgets.aiChat.footerMemory")}</span>
        <span>•</span>
        <span>{t("workspaceWidgets.aiChat.footerDataAware")}</span>
      </div>
    </div>
  );
}
