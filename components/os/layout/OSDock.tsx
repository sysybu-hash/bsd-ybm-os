"use client";

import React from 'react';
import Omnibar from '@/components/os/Omnibar';

interface OSDockProps {
  systemMessage: string;
  onCommand: (cmd: string) => void;
  apiLatency: number | null;
  isBusy: boolean;
  onSearchPreview?: (query: string) => void;
  searchResults?: any[];
  onSelectResult?: (result: any) => void;
}

export default function OSDock({
  systemMessage,
  onCommand,
  apiLatency,
  isBusy,
  onSearchPreview,
  searchResults,
  onSelectResult
}: OSDockProps) {
  return (
    <footer className="relative px-4 md:px-8 pb-6 md:pb-12 z-[1100] pointer-events-auto">
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
        />
      </div>
    </footer>
  );
}
