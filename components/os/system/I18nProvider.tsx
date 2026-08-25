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

/**
 * Loads every message pack for a locale, on demand.
 *
 * `lib/i18n/load-messages` statically imports 11 packs × 3 locales. This
 * provider was the only client-side importer of it, which put **843KB of JSON —
 * measured, the single largest chunk the workspace downloads** — into the main
 * bundle. All of it existed to serve the optimistic locale switch below: the
 * server already sends the right pack as the `messages` prop, so on the normal
 * path none of it is ever read.
 *
 * As a dynamic import it splits into its own chunk and is fetched only when
 * someone actually changes language client-side.
 */
async function loadMessages(locale: string): Promise<MessageTree> {
  const { getMessages } = await import("@/lib/i18n/load-messages");
  return getMessages(locale);
}

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
      let cancelled = false;
      void loadMessages(locale).then((next) => {
        if (!cancelled) setMessages(next);
      });
      return () => {
        cancelled = true;
      };
    }
    setMessages(messagesPropRef.current);
    return undefined;
  }, [pack, localeProp, locale]);

  // bfcache restore can revive a stuck marketing pack while the URL is already workspace.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      if (locale !== localeProp) {
        void loadMessages(locale).then(setMessages);
        return;
      }
      setMessages(messagesPropRef.current);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [locale, localeProp]);

  const setLocale = useCallback((next: string) => {
    setLocaleState(next);
    // The pack arrives a tick later than it used to. The previous locale's text
    // stays on screen until it does, which is the same thing that happens today
    // while the server catches up — not a blank UI.
    void loadMessages(next).then(setMessages);
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
