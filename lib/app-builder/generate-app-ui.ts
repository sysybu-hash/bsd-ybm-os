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
import { getGeminiModelId } from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

const log = createLogger("app-builder-generate-ui");
const MODEL = getGeminiModelId();

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
  let jsxCode: string | undefined;

  /**
   * The schema and the JSX are generated at the same time, not one after the
   * other.
   *
   * Neither depends on the other — they read the same description — but running
   * them in sequence made this function cost the sum of two Gemini calls, the
   * second of which asks for up to 8192 output tokens. On Vercel that shares a
   * single 60s invocation and reliably blew through it:
   * FUNCTION_INVOCATION_TIMEOUT, measured at 61s against production, which is
   * why the App Builder appeared to do nothing at all. In parallel the cost is
   * the slower of the two rather than both.
   *
   * `allSettled`, not `all`: JSX generation is best-effort. A schema still
   * renders through DynamicRenderer without it, and a rejected JSX call must not
   * take the schema down with it.
   */
  const [schemaResult, jsxResult] = await Promise.allSettled([
    generateUiSchemaFromPrompt(generatorPrompt, params.locale),
    generateText({
      model: google(MODEL),
      system: JSX_SYSTEM_PROMPT,
      prompt: description,
      // A dashboard of a few cards runs past 8192 and came back cut off mid-tag.
      maxOutputTokens: 16384,
    }),
  ]);

  if (schemaResult.status === "fulfilled" && schemaResult.value.ok) {
    uiSchema = schemaResult.value.schema;
  } else {
    log.warn("ui_schema_rejected", {
      error:
        schemaResult.status === "fulfilled" && !schemaResult.value.ok
          ? schemaResult.value.error
          : String(schemaResult.status === "rejected" ? schemaResult.reason : "unknown"),
      orgId: params.orgId,
    });
    schemaError = "schema_rejected";
  }

  if (jsxResult.status === "fulfilled") {
    /**
     * A truncated component is worse than none.
     *
     * The model hits the output cap and stops mid-element — observed ending on a
     * bare "<" after 17k characters. `isLikelyReactComponent` still passed it,
     * because the opening looks like a component; it is only invalid at the end.
     * The preview then failed to compile and showed a Babel parse error where a
     * working UI should have been.
     *
     * `finishReason === "length"` is the model telling us exactly this, so the
     * JSX is dropped and the preview falls back to the UI schema, which renders
     * through DynamicRenderer and is generated independently.
     */
    const truncated = jsxResult.value.finishReason === "length";
    const cleanCode = truncated ? "" : sanitizeGeneratedJsx(jsxResult.value.text);
    if (truncated) {
      log.warn("jsx_truncated", {
        orgId: params.orgId,
        chars: jsxResult.value.text.length,
      });
    } else if (isLikelyReactComponent(cleanCode)) {
      jsxCode = cleanCode;
      log.info("jsx_generated", { orgId: params.orgId, chars: jsxCode.length });
    } else {
      log.warn("jsx_invalid", { orgId: params.orgId, chars: cleanCode.length });
    }
  } else {
    log.warn("jsx_generation_failed", {
      error: String(jsxResult.reason),
      orgId: params.orgId,
    });
  }

  return { uiSchema, jsxCode, schemaError };
}
