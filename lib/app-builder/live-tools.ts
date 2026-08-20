import type { FunctionDeclaration } from "@google/genai";
import { GEMINI_SCHEMA_TYPE } from "@/lib/gemini-live/api-constants";

/** הצהרות כלים ל-Gemini Live במחולל האפליקציות — בניית UI בלבד. */
export function getAppBuilderLiveToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: "build_ui",
      description:
        "Build a NEW React + Tailwind UI component in the App Builder preview from the user's voice request. Use when there is no app yet or the user wants a completely new component (clock, form, dashboard, game, calculator, chart, etc.). After calling, briefly confirm what was built in speech — do NOT read JSX aloud.",
      parameters: {
        type: GEMINI_SCHEMA_TYPE.OBJECT,
        properties: {
          description: {
            type: GEMINI_SCHEMA_TYPE.STRING,
            description:
              "Detailed build spec in the user's language: visual style, layout, behavior, data fields, animations. Include everything the user asked for.",
          },
        },
        required: ["description"],
      },
    },
    {
      name: "update_ui",
      description:
        "Update or refine the EXISTING component in the App Builder preview according to the user's voice request. Use when an app is already shown and the user asks to change colors, add fields, fix layout, etc. After calling, briefly confirm the change in speech.",
      parameters: {
        type: GEMINI_SCHEMA_TYPE.OBJECT,
        properties: {
          description: {
            type: GEMINI_SCHEMA_TYPE.STRING,
            description:
              "Precise change request: what to add, remove, or restyle in the current preview.",
          },
        },
        required: ["description"],
      },
    },
  ] as FunctionDeclaration[];
}

export const APP_BUILDER_LIVE_TOOL_NAMES = new Set(["build_ui", "update_ui"]);
