"use client";

import { ReactNode } from "react";

export function I18nProvider({ children }: { children: ReactNode; messages?: any; locale?: string }) {
  return <>{children}</>;
}

export function useI18n() {
  return {
    t: (key: string) => key,
    locale: "he",
    dir: "rtl",
    messages: {} as any,
  };
}
