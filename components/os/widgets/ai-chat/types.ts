import type { WidgetType } from "@/hooks/use-window-manager";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export type AiChatFullWidgetProps = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};

export function formatChatTime(locale: string) {
  const tag = locale === "he" ? "he-IL" : locale === "ru" ? "ru-RU" : "en-US";
  return new Date().toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
}
