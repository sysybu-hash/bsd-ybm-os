"use client";

import { createContext, useContext, ReactNode, useMemo, useCallback, useState } from "react";
import { isRtlLocale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { getMessages } from "@/lib/i18n/load-messages";
import type { MessageTree } from "@/lib/i18n/keys";

type I18nContextType = {
  t: (key: string, vars?: Record<string, string>) => string;
  locale: string;
  dir: "rtl" | "ltr";
  messages: MessageTree;
};

type SetLocaleFn = (locale: string) => void;

const I18nContext = createContext<I18nContextType | null>(null);
const SetLocaleContext = createContext<SetLocaleFn | null>(null);

export function I18nProvider({
  children,
  messages: initialMessages = {} as MessageTree,
  locale: initialLocale = "he",
}: {
  children: ReactNode;
  messages?: MessageTree;
  locale?: string;
}) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [messages, setMessages] = useState(initialMessages);

  const setLocale = useCallback((next: string) => {
    setLocaleState(next);
    setMessages(getMessages(next));
  }, []);

  const dir = (isRtlLocale(locale) ? "rtl" : "ltr") as "rtl" | "ltr";
  const t = useMemo(() => createTranslator(messages), [messages]);
  const value = useMemo(() => ({ t, locale, dir, messages }), [t, locale, dir, messages]);

  return (
    <SetLocaleContext.Provider value={setLocale}>
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </SetLocaleContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      t: (key: string) => key,
      locale: "he",
      dir: "rtl" as const,
      messages: {} as MessageTree,
    };
  }
  return ctx;
}

export function useSetLocale(): SetLocaleFn | null {
  return useContext(SetLocaleContext);
}
