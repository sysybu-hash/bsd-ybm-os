import type { WidgetType } from "@/hooks/use-window-manager";
import type { UIMessage } from "ai";

export type Source = {
  id: string;
  name: string;
  content: string;
  type: "pdf" | "text";
};

export type SavedNotebookSummary = {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: string;
  sourceCount: number;
  messageCount: number;
};

export type ProjectOption = { id: string; name: string };

export type NotebookLMWidgetProps = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};

export function uiMessagesFromStored(
  stored: Array<{ id?: string; role: string; content: string }>,
): UIMessage[] {
  return stored.map((m, i) => ({
    id: m.id ?? `msg-${i}`,
    role: m.role as UIMessage["role"],
    parts: [{ type: "text" as const, text: m.content }],
  }));
}
