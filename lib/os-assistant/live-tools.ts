import { Type, type FunctionDeclaration } from "@google/genai";
import { AUTOMATION_INTENT_ENUM } from "@/lib/os-automations/catalog";
import { OS_ASSISTANT_WIDGETS } from "@/lib/os-assistant/widget-catalog";

const WIDGET_ENUM = OS_ASSISTANT_WIDGETS.map((w) => w.id);

/** הצהרות כלים ל-Gemini Live WebSocket */
export function getOsAssistantLiveToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: "execute_user_command",
      description:
        "PRIMARY tool — runs real actions in BSD-YBM OS from natural language. Use for: create invoice/quote/receipt, add task, new client, scan with instructions, open any screen, Meckano clock in/out, notebook, multi-step requests, or when unsure. Pass the user's full sentence unchanged (Hebrew/English/Russian). Always prefer this for complex commands.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          message: {
            type: Type.STRING,
            description: "Full user request in natural language, e.g. 'צור חשבונית ללקוח יוסי על 5000 שקל'",
          },
        },
        required: ["message"],
      },
    },
    {
      name: "run_automation",
      description:
        "Runs one known automation intent with structured params. Use when intent is clear: create_invoice, create_quote, create_task, create_contact, open_scanner, scan_with_instructions, save_scan_to_notebook, meckano_clock_in/out, open_dashboard, open_crm, open_project_board, open_erp_archive, open_google_drive, open_notebook, clear_layout, close_widget, export_document, search_client, open_project, and all catalog intents.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          intent: {
            type: Type.STRING,
            enum: AUTOMATION_INTENT_ENUM,
            description: "Automation intent id",
          },
          params: {
            type: Type.OBJECT,
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
        "Opens a workspace widget only (navigation, no data creation). Widget ids: dashboard, projectBoard, crmTable, docCreator, aiScanner, erpArchive, googleDrive, notebookLM, aiChatFull, meckanoReports, settings, helpCenter, and all OS_ASSISTANT_WIDGETS ids.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            enum: WIDGET_ENUM,
            description: "Widget id to open",
          },
          payload: {
            type: Type.OBJECT,
            description: "Optional data (e.g. project name, prompt)",
            properties: {
              name: { type: Type.STRING },
              prompt: { type: Type.STRING },
            },
          },
        },
        required: ["action"],
      },
    },
    {
      name: "search_site",
      description:
        "Searches clients and projects in the database by name; opens the best match. Use before create_invoice/create_quote when the client name might be ambiguous or to answer 'find client X'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Search string" },
        },
        required: ["query"],
      },
    },
  ];
}
