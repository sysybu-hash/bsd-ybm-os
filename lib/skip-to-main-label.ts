import type { MessageTree } from "@/lib/i18n/keys";
import type { AppLocale } from "@/lib/i18n/config";

/** טקסט קישור «דלוג לתוכן» לשורש ה־layout (שרת) — מסונכן עם `workspaceNav.skipToMain` */
export function skipToMainLabel(messages: MessageTree, locale: AppLocale): string {
  const nav = (messages as unknown as Record<string, unknown>).workspaceNav as Record<string, unknown> | undefined;
  const fromPack = typeof nav?.skipToMain === "string" ? nav.skipToMain.trim() : "";
  if (fromPack) return fromPack;
  if (locale === "en") return "Skip to main content";
  if (locale === "ru") return "Перейти к основному содержимому";
  return "דלג לתוכן הראשי";
}
