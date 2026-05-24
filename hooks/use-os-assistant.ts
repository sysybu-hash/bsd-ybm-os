"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { OsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { handleOsAssistantToolCall, type OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";

function fallbackInstruction(locale: string, voice = false) {
  const lang =
    locale === "en" ? "English" : locale === "ru" ? "Russian" : "Hebrew";
  if (voice) {
    return `You are the BSD-YBM OS voice assistant (Gemini Live). Reply in ${lang} only. Use tools for all in-app actions: execute_user_command, run_automation, execute_os_command, search_site. Answer any topic when asked.`;
  }
  return `You are the BSD-YBM OS assistant. Always reply in ${lang}. Never show internal reasoning. Open widgets when asked using execute_os_command.`;
}

export function useOsAssistant(deps: OsAssistantToolDeps) {
  const { data: session, status } = useSession();
  const { locale } = useI18n();
  const [context, setContext] = useState<OsAssistantUserContext | null>(null);
  const [systemInstruction, setSystemInstruction] = useState(() => fallbackInstruction(locale));
  const [systemInstructionVoice, setSystemInstructionVoice] = useState(() =>
    fallbackInstruction(locale, true),
  );
  const [loading, setLoading] = useState(false);
  const [featureFlags, setFeatureFlags] = useState({
    knowledgeVaultEnabled: false,
    aiChatLiveDefault: false,
    geminiLiveAdvancedFeatures: false,
    geminiLiveEnabled: true,
  });

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!session?.user?.id) {
      setContext(null);
      setSystemInstruction(fallbackInstruction(locale));
      setSystemInstructionVoice(fallbackInstruction(locale, true));
      return false;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/os/assistant/context", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setSystemInstructionVoice(fallbackInstruction(locale, true));
        return fallbackInstruction(locale, true).trim().length >= 80;
      }
      const data = (await res.json()) as {
        context?: OsAssistantUserContext;
        systemInstruction?: string;
        systemInstructionVoice?: string;
        featureFlags?: Partial<typeof featureFlags>;
      };
      if (data.context) setContext(data.context);
      if (typeof data.systemInstruction === "string") setSystemInstruction(data.systemInstruction);
      if (data.featureFlags) {
        setFeatureFlags((prev) => ({ ...prev, ...data.featureFlags }));
      }
      if (typeof data.systemInstructionVoice === "string") {
        setSystemInstructionVoice(data.systemInstructionVoice);
        return data.systemInstructionVoice.trim().length >= 80;
      }
      const voice = fallbackInstruction(locale, true);
      setSystemInstructionVoice(voice);
      return voice.trim().length >= 80;
    } catch {
      const voice = fallbackInstruction(locale, true);
      setSystemInstructionVoice(voice);
      return voice.trim().length >= 80;
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, locale]);

  useEffect(() => {
    if (status === "authenticated") void refresh();
  }, [status, refresh, locale]);

  const onToolCall = useCallback(
    async (name: string, args: Record<string, unknown>) =>
      handleOsAssistantToolCall(name, args, deps),
    [deps],
  );

  const hasRichContext =
    Boolean(context?.capabilities.geminiLive) &&
    systemInstructionVoice.length > 120 &&
    !systemInstructionVoice.startsWith(
      "You are the BSD-YBM OS voice assistant (Gemini Live). Reply in",
    );

  return {
    context,
    systemInstruction,
    systemInstructionVoice,
    featureFlags,
    loading,
    refresh,
    onToolCall,
    ready: Boolean(session?.user?.id) && !loading,
    hasRichContext,
  };
}
