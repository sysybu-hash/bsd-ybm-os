"use client";

import React from "react";
import { KnowledgeVaultProvider } from "@/components/os/KnowledgeVaultProvider";
import { useOsAssistant } from "@/hooks/use-os-assistant";
import type { OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";

type Props = {
  children: React.ReactNode;
  assistantToolDeps: OsAssistantToolDeps;
};

/** עוטף את סביבת העבודה ב־KnowledgeVaultProvider לפי דגלי פלטפורמה. */
export default function KnowledgeVaultWorkspaceBridge({ children, assistantToolDeps }: Props) {
  const osAssistant = useOsAssistant(assistantToolDeps);
  const enabled =
    osAssistant.ready && osAssistant.featureFlags.knowledgeVaultEnabled === true;

  return (
    <KnowledgeVaultProvider knowledgeVaultEnabled={enabled}>
      {children}
    </KnowledgeVaultProvider>
  );
}
