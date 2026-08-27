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
  const jsxCode: string | undefined = undefined;

  /**
   * Only the schema is generated here.
   *
   * The JSX used to run alongside it. Even in parallel the two share one 60s
   * Vercel invocation, and the JSX call — up to 16k output tokens — is the long
   * pole: measured timing out at 61s against production, so the user got
   * nothing rather than a slower result.
   *
   * The schema alone is fast and renders through DynamicRenderer, so it is what
   * a build returns. `generateAppBuilderJsx` upgrades that to a live React
   * preview from its own request; see app/api/ai-builder/jsx/route.ts.
   */
  const sanitized = await generateUiSchemaFromPrompt(generatorPrompt, params.locale);
  if (sanitized.ok) {
    uiSchema = sanitized.schema;
  } else {
    log.warn("ui_schema_rejected", { error: sanitized.error, orgId: params.orgId });
    schemaError = "schema_rejected";
  }

  return { uiSchema, jsxCode, schemaError };
}

/**
 * The live React preview for a prompt — the optional half of a build.
 *
 * Returns undefined rather than throwing when the model gives back something
 * unusable, because the caller already has a working schema-rendered dashboard
 * and this is an upgrade on top of it.
 *
 * Truncation is checked explicitly. The model stops mid-element when it hits the
 * output cap — observed ending on a bare "<" after 17k characters — and
 * `isLikelyReactComponent` still accepts it, because only the end is invalid.
 * The preview then fails to compile and shows a Babel parse error where a
 * working UI should be, which is strictly worse than not offering the upgrade.
 */
export async function generateAppBuilderJsx(
  description: string,
  orgId?: string,
): Promise<string | undefined> {
  try {
    const result = await generateText({
      model: google(MODEL),
      system: JSX_SYSTEM_PROMPT,
      prompt: description,
      maxOutputTokens: 16384,
    });

    if (result.finishReason === "length") {
      log.warn("jsx_truncated", { orgId, chars: result.text.length });
      return undefined;
    }

    const cleanCode = sanitizeGeneratedJsx(result.text);
    if (!isLikelyReactComponent(cleanCode)) {
      log.warn("jsx_invalid", { orgId, chars: cleanCode.length });
      return undefined;
    }

    log.info("jsx_generated", { orgId, chars: cleanCode.length });
    return cleanCode;
  } catch (err: unknown) {
    log.warn("jsx_generation_failed", {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    });
    return undefined;
  }
}
