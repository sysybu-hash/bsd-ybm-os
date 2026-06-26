import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import {
  buildRefinePrompt,
  generateUiSchemaFromPrompt,
} from "@/lib/app-builder/generate-ui-schema";
import {
  isLikelyReactComponent,
  sanitizeGeneratedJsx,
} from "@/lib/app-builder/jsx-preview-utils";
import { env } from "@/lib/env";
import { GEMINI_STABLE_TEXT_MODEL } from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

const log = createLogger("app-builder-generate-ui");
const MODEL = env.GEMINI_MODEL?.trim() || GEMINI_STABLE_TEXT_MODEL;

export type GenerateAppBuilderUiResult = {
  uiSchema?: AppBuilderUiSchema;
  jsxCode?: string;
  schemaError?: string;
};

const JSX_SYSTEM_PROMPT = [
  "You are an elite React and Tailwind CSS engineer.",
  "Build ANYTHING the user requests: clocks, games, calculators, animations, charts, dashboards, forms, or any creative UI.",
  "Never refuse. Never say it is too complex.",
  "",
  "STRICT OUTPUT RULES — violating any rule will break the renderer:",
  "1. Return ONLY the raw React component code. No markdown. No backticks. No ```jsx or ``` fences of any kind.",
  "2. Do NOT include any explanatory text, comments about the code, or prose before or after the component.",
  "3. Start the response with exactly 'import React' or 'export default function' — nothing else before it.",
  "4. Export a single default functional component.",
  "5. Use Tailwind CSS classes exclusively for styling (Tailwind CDN is injected, all classes work).",
  "6. Use only React (useState, useEffect, useRef, etc. are available). Do NOT import any other library.",
  "7. Ensure all parentheses, brackets, and braces are perfectly balanced — no syntax errors.",
  "8. For animations (clocks, loaders) inject a <style> tag with @keyframes inside the JSX, or use inline style={{animation:...}}.",
].join("\n");

/** Shared UI generation used by text chat and Gemini Live tool calls. */
export async function generateAppBuilderUiFromPrompt(params: {
  description: string;
  locale: string;
  currentUiSchema?: AppBuilderUiSchema | null;
  orgId?: string;
  mode?: "build" | "update";
}): Promise<GenerateAppBuilderUiResult> {
  const description = params.description.trim();
  if (!description) {
    return { schemaError: "empty_description" };
  }

  const refining =
    params.mode === "update" && params.currentUiSchema != null
      ? params.currentUiSchema
      : params.mode !== "build" && params.currentUiSchema != null
        ? params.currentUiSchema
        : null;

  const generatorPrompt =
    refining != null ? buildRefinePrompt(description, refining) : description;

  let uiSchema: AppBuilderUiSchema | undefined;
  let schemaError: string | undefined;

  const sanitized = await generateUiSchemaFromPrompt(generatorPrompt, params.locale);
  if (sanitized.ok) {
    uiSchema = sanitized.schema;
  } else {
    log.warn("ui_schema_rejected", {
      error: sanitized.error,
      orgId: params.orgId,
    });
    schemaError = "schema_rejected";
  }

  let jsxCode: string | undefined;
  try {
    const { text } = await generateText({
      model: google(MODEL),
      system: JSX_SYSTEM_PROMPT,
      prompt: description,
      maxOutputTokens: 8192,
    });

    const cleanCode = sanitizeGeneratedJsx(text);
    if (isLikelyReactComponent(cleanCode)) {
      jsxCode = cleanCode;
      log.info("jsx_generated", { orgId: params.orgId, chars: jsxCode.length });
    } else {
      log.warn("jsx_invalid", { orgId: params.orgId, chars: cleanCode.length });
    }
  } catch (jsxErr: unknown) {
    log.warn("jsx_generation_failed", {
      error: jsxErr instanceof Error ? jsxErr.message : String(jsxErr),
      orgId: params.orgId,
    });
  }

  return { uiSchema, jsxCode, schemaError };
}
