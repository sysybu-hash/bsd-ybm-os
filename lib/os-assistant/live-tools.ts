import { OS_ASSISTANT_WIDGETS } from "@/lib/os-assistant/widget-catalog";

const WIDGET_ENUM = OS_ASSISTANT_WIDGETS.map((w) => w.id);

/** הצהרות כלים ל-Gemini Live WebSocket */
export function getOsAssistantLiveToolDeclarations() {
  return [
    {
      name: "execute_os_command",
      description:
        "פותח חלון/ווידג'ט במערכת BSD-YBM OS (דאשבורד, CRM, פרויקטים, סריקה, מסמכים, הגדרות וכו')",
      parameters: {
        type: "OBJECT",
        properties: {
          action: {
            type: "STRING",
            enum: WIDGET_ENUM,
            description: "מזהה הווידג'ט לפתיחה",
          },
          payload: {
            type: "OBJECT",
            description: "נתונים אופציונליים (למשל שם פרויקט)",
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
      description: "מחפש לקוחות ופרויקטים במערכת לפי שם או מילות מפתח",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "מחרוזת חיפוש" },
        },
        required: ["query"],
      },
    },
    {
      name: "google_assistant_command",
      description: "פקודה ל-Google Assistant (מזג אוויר, בית חכם וכו')",
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
