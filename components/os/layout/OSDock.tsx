"use client";

import React from 'react';
import Omnibar from '@/components/os/Omnibar';
import type { WidgetType } from '@/hooks/use-window-manager';

type SearchResult = {
  type: 'project' | 'contact';
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
  openWorkspaceWidget: (type: WidgetType) => void;
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
}: OSDockProps) {
  return (
    <footer className="relative z-[1100] hidden pointer-events-auto md:block px-4 pb-5 md:px-8 md:pb-8">
      <div className="max-w-3xl mx-auto">
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
        />
      </div>
    </footer>
  );
}
