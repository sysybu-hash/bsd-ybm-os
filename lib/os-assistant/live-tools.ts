import { AUTOMATION_INTENT_ENUM } from "@/lib/os-automations/catalog";
import { OS_ASSISTANT_WIDGETS } from "@/lib/os-assistant/widget-catalog";

const WIDGET_ENUM = OS_ASSISTANT_WIDGETS.map((w) => w.id);

/** הצהרות כלים ל-Gemini Live WebSocket */
export function getOsAssistantLiveToolDeclarations() {
  return [
    {
      name: "execute_user_command",
      description:
        "PRIMARY tool for any in-app request: create invoice/quote, add task, add client, scan, open screens, clock in/out, or combined requests. Pass the user's exact words in Hebrew. Use when unsure which specific tool to call, or when the request has multiple steps.",
      parameters: {
        type: "OBJECT",
        properties: {
          message: {
            type: "STRING",
            description: "Full user request in natural language, e.g. 'צור חשבונית ללקוח יוסי על 5000 שקל'",
          },
        },
        required: ["message"],
      },
    },
    {
      name: "run_automation",
      description:
        "Runs a specific automation when you know the exact intent. Examples: create_invoice (clientName, amount, lineDescription), create_task (title, projectName), create_contact (name), open_scanner, meckano_clock_in, save_scan_to_notebook.",
      parameters: {
        type: "OBJECT",
        properties: {
          intent: {
            type: "STRING",
            enum: AUTOMATION_INTENT_ENUM,
            description: "Automation intent id",
          },
          params: {
            type: "OBJECT",
            description:
              "Intent params: create_invoice → clientName, amount, lineDescription; create_task → title, projectName, priority, dueDate; create_contact → name, email, phone; scan_with_instructions → userInstruction",
          },
        },
        required: ["intent"],
      },
    },
    {
      name: "execute_os_command",
      description:
        "Opens a workspace window only (no create/submit). Use for navigation: dashboard, projectBoard, crmTable, docCreator, aiScanner, etc.",
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
            description: "Optional data (e.g. project name, prompt)",
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
        "Searches clients and projects by name. Opens the best match. Use before create_invoice if client name is ambiguous.",
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
        "External queries only: weather, smart home, general knowledge. NOT for BSD-YBM OS actions.",
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
