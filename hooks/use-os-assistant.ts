"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { OsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { handleOsAssistantToolCall, type OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";

const FALLBACK_INSTRUCTION =
  "You are the BSD-YBM OS assistant. Reply in the user's interface language. Open widgets when asked using execute_os_command.";

export function useOsAssistant(deps: OsAssistantToolDeps) {
  const { data: session, status } = useSession();
  const { locale } = useI18n();
  const [context, setContext] = useState<OsAssistantUserContext | null>(null);
  const [systemInstruction, setSystemInstruction] = useState(FALLBACK_INSTRUCTION);
  const [systemInstructionVoice, setSystemInstructionVoice] = useState(FALLBACK_INSTRUCTION);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.user?.id) {
      setContext(null);
      setSystemInstruction(FALLBACK_INSTRUCTION);
      setSystemInstructionVoice(FALLBACK_INSTRUCTION);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/os/assistant/context", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        context?: OsAssistantUserContext;
        systemInstruction?: string;
        systemInstructionVoice?: string;
      };
      if (data.context) setContext(data.context);
      if (typeof data.systemInstruction === "string") setSystemInstruction(data.systemInstruction);
      if (typeof data.systemInstructionVoice === "string") {
        setSystemInstructionVoice(data.systemInstructionVoice);
      }
    } catch {
      /* keep fallback */
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (status === "authenticated") void refresh();
  }, [status, refresh, locale]);

  const onToolCall = useCallback(
    async (name: string, args: Record<string, unknown>) =>
      handleOsAssistantToolCall(name, args, deps),
    [deps],
  );

  return {
    context,
    systemInstruction,
    systemInstructionVoice,
    loading,
    refresh,
    onToolCall,
    ready: Boolean(session?.user?.id) && !loading,
  };
}
