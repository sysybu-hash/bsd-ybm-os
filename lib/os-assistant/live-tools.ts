import { OS_ASSISTANT_WIDGETS } from "@/lib/os-assistant/widget-catalog";

const WIDGET_ENUM = OS_ASSISTANT_WIDGETS.map((w) => w.id);

/** הצהרות כלים ל-Gemini Live WebSocket */
export function getOsAssistantLiveToolDeclarations() {
  return [
    {
      name: "execute_os_command",
      description:
        "Opens a workspace window in BSD-YBM OS (dashboard, CRM, projects, AI scan, documents, settings, etc.). Use when the user asks to open, show, or go to a screen.",
      parameters: {
        type: "OBJECT",
        properties: {
          action: {
            type: "STRING",
            enum: WIDGET_ENUM,
            description: "Widget id to open",
          },
          payload: {
            type: "OBJECT",
            description: "Optional data (e.g. project name)",
            properties: {
              name: { type: "STRING" },
              prompt: { type: "STRING" },
            },
          },
        },
        required: ["action"],
      },
    },
    {
      name: "search_site",
      description:
        "Searches clients and projects in BSD-YBM by name or keywords. Use when the user names a client or project to find.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Search string" },
        },
        required: ["query"],
      },
    },
    {
      name: "google_assistant_command",
      description:
        "Sends a query to Google Assistant (weather, smart home, general knowledge). Not for in-app navigation.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING" },
        },
        required: ["query"],
      },
    },
  ];
}
