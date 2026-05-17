"use client";

import React from "react";
import Omnibar from "@/components/os/Omnibar";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";

type SearchResult = {
  type: "project" | "contact";
  name: string;
  taxId?: string;
  relevance?: number;
};

interface OSDockProps {
  systemMessage: string;
  onCommand: (cmd: string) => void;
  apiLatency: number | null;
  isBusy: boolean;
  onSearchPreview?: (query: string) => void;
  searchResults?: SearchResult[];
  onSelectResult?: (result: SearchResult) => void;
  openWorkspaceWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  assistantToolDeps?: OsAssistantToolDeps;
}

export default function OSDock({
  systemMessage,
  onCommand,
  apiLatency,
  isBusy,
  onSearchPreview,
  searchResults,
  onSelectResult,
  openWorkspaceWidget,
  assistantToolDeps,
}: OSDockProps) {
  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-[1100] hidden px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:block md:px-8">
      <div className="pointer-events-auto mx-auto max-w-3xl">
        <Omnibar
          status="ready"
          message={systemMessage}
          onCommand={onCommand}
          apiLatency={apiLatency}
          isBusy={isBusy}
          onSearchPreview={onSearchPreview}
          searchResults={searchResults}
          onSelectResult={onSelectResult}
          openWorkspaceWidget={openWorkspaceWidget}
          assistantToolDeps={assistantToolDeps}
        />
      </div>
    </footer>
  );
}
