import type { FunctionDeclaration } from "@google/genai";
import { GEMINI_SCHEMA_TYPE } from "@/lib/gemini-live/api-constants";

/** הצהרות כלים ל-Gemini Live WebSocket — בלי enum ארוכים (גורם ל-Internal error ב-Google). */
export function getOsAssistantLiveToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: "execute_user_command",
      description:
        "PRIMARY tool — runs real actions in BSD-YBM OS from natural language. Use for: create invoice/quote/receipt, add task, new client, scan with instructions, open any screen, Meckano clock in/out, notebook, multi-step requests, or when unsure. Pass the user's full sentence unchanged (Hebrew/English/Russian). Always prefer this for complex commands.",
      parameters: {
        type: GEMINI_SCHEMA_TYPE.OBJECT,
        properties: {
          message: {
            type: GEMINI_SCHEMA_TYPE.STRING,
            description: "Full user request in natural language, e.g. 'צור חשבונית ללקוח יוסי על 5000 שקל'",
          },
        },
        required: ["message"],
      },
    },
    {
      name: "run_automation",
      description:
        "Runs one known automation intent with structured params. Use when intent is clear: create_invoice, create_quote, create_task, create_contact, open_scanner, open_field_copilot, create_field_quote, scan_with_instructions, save_scan_to_notebook, meckano_clock_in/out, open_dashboard, open_crm, open_project_board, open_erp_archive, open_google_drive, open_notebook, clear_layout, close_widget, export_document, search_client, open_project, and all catalog intents.",
      parameters: {
        type: GEMINI_SCHEMA_TYPE.OBJECT,
        properties: {
          intent: {
            type: GEMINI_SCHEMA_TYPE.STRING,
            description:
              "Automation intent id (snake_case), e.g. create_invoice, create_task, open_scanner, meckano_clock_in",
          },
          params: {
            type: GEMINI_SCHEMA_TYPE.OBJECT,
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
        "Opens a workspace widget only (navigation, no data creation). Widget ids: dashboard, projectBoard, crmTable, docCreator, aiScanner, fieldCopilot, erpArchive, googleDrive, notebookLM, aiChatFull, meckanoReports, settings, helpCenter, and all OS_ASSISTANT_WIDGETS ids.",
      parameters: {
        type: GEMINI_SCHEMA_TYPE.OBJECT,
        properties: {
          action: {
            type: GEMINI_SCHEMA_TYPE.STRING,
            description: "Widget id to open, e.g. dashboard, crmTable, aiChatFull",
          },
          payload: {
            type: GEMINI_SCHEMA_TYPE.OBJECT,
            description: "Optional data (e.g. project name, prompt)",
            properties: {
              name: { type: GEMINI_SCHEMA_TYPE.STRING },
              prompt: { type: GEMINI_SCHEMA_TYPE.STRING },
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
        type: GEMINI_SCHEMA_TYPE.OBJECT,
        properties: {
          query: { type: GEMINI_SCHEMA_TYPE.STRING, description: "Search string" },
        },
        required: ["query"],
      },
    },
  ] as FunctionDeclaration[];
}
