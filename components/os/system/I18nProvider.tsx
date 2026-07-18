"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useCallback,
  useState,
  useEffect,
  useRef,
} from "react";
import { isRtlLocale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { getMessages } from "@/lib/i18n/load-messages";
import type { MessageTree } from "@/lib/i18n/keys";

export type I18nMessagePack = "marketing" | "workspace" | "full";

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
  messages: messagesProp = {} as MessageTree,
  locale: localeProp = "he",
  pack = "full",
}: {
  children: ReactNode;
  messages?: MessageTree;
  locale?: string;
  /** Which slim/full pack the layout seeded — used to adopt richer packs after soft nav */
  pack?: I18nMessagePack;
}) {
  const [locale, setLocaleState] = useState(localeProp);
  const [messages, setMessages] = useState(messagesProp);
  const messagesPropRef = useRef(messagesProp);
  messagesPropRef.current = messagesProp;

  useEffect(() => {
    setLocaleState(localeProp);
  }, [localeProp]);

  /**
   * Soft navigations (e.g. /login → /workspace) keep this provider mounted.
   * Without syncing on pack change, marketing messages stay and workspace keys render raw
   * (often noticed after browser Back into a widget).
   */
  useEffect(() => {
    if (locale !== localeProp) {
      // Optimistic locale switch — full pack until the server locale catches up.
      setMessages(getMessages(locale));
      return;
    }
    setMessages(messagesPropRef.current);
  }, [pack, localeProp, locale]);

  // bfcache restore can revive a stuck marketing pack while the URL is already workspace.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      if (locale !== localeProp) {
        setMessages(getMessages(locale));
        return;
      }
      setMessages(messagesPropRef.current);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [locale, localeProp]);

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
