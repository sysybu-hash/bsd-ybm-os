"use client";

import { createContext, useContext, ReactNode, useMemo } from "react";
import { createTranslator } from "@/lib/i18n/translate";

type I18nContextType = {
  t: (key: string, vars?: Record<string, string>) => string;
  locale: string;
  dir: "rtl" | "ltr";
  messages: any;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({
  children,
  messages = {},
  locale = "he",
}: {
  children: ReactNode;
  messages?: any;
  locale?: string;
}) {
  const dir = (locale === "he" || locale === "ar" ? "rtl" : "ltr") as "rtl" | "ltr";
  
  const t = useMemo(() => createTranslator(messages), [messages]);

  const value = useMemo(
    () => ({
      t,
      locale,
      dir,
      messages,
    }),
    [t, locale, dir, messages]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      t: (key: string) => key,
      locale: "he",
      dir: "rtl",
      messages: {} as any,
    };
  }
  return ctx;
}
