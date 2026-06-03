import { generateObject, generateText } from "ai";
import { google } from "@ai-sdk/google";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { APP_BUILDER_CHAT_SYSTEM_PROMPT } from "@/lib/app-builder/chat-system-prompt";
import { appBuilderCapabilitiesForPrompt } from "@/lib/app-builder/platform-capabilities-for-prompt";
import {
  buildRefinePrompt,
  generateUiSchemaFromPrompt,
} from "@/lib/app-builder/generate-ui-schema";
import { env } from "@/lib/env";
import { GEMINI_STABLE_TEXT_MODEL } from "@/lib/gemini-model";
import { jsonBadRequest, jsonServiceUnavailable, jsonTooManyRequests } from "@/lib/api-json";
import { getServerLocale } from "@/lib/i18n/server";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import { createLogger } from "@/lib/logger";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeAutomationIntent } from "@/lib/os-automations/catalog";
import { parseOsActionMessage } from "@/lib/os-automations/parse-action-server";
import type { AutomationAction } from "@/lib/os-automations/types";
import { isAutomationIntentEnabled } from "@/lib/platform-settings";
import { appBuilderUiSchema } from "@/lib/validation/schemas/app-builder";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = createLogger("ai-app-builder-chat");

const MODEL = env.GEMINI_MODEL?.trim() || GEMINI_STABLE_TEXT_MODEL;
const ORG_REQUESTS_PER_HOUR = 60;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(24),
  locale: z.string().optional(),
  currentUiSchema: appBuilderUiSchema.nullish(),
});

const chatIntentSchema = z.object({
  reply: z.string().describe("Friendly reply to the user in their language"),
  generateApp: z
    .boolean()
    .describe(
      "ALWAYS true whenever the user requests ANY visual component, app, UI, widget, game, " +
      "clock, calculator, chart, animation, dashboard, form, table, kanban, calendar, or " +
      "ANY creative/visual thing. Only false for pure questions with no UI request.",
    ),
  appPrompt: z
    .string()
    .optional()
    .describe(
      "Precise description of the component/app to build. Required when generateApp=true. " +
      "Include visual style, behavior, and any data. Be explicit and detailed.",
    ),
  platformActions: z
    .array(
      z.object({
        intent: z.string().min(1).max(80),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(5)
    .optional()
    .describe("Platform automations to run (open CRM, create invoice, scan, etc.)"),
});

async function resolvePlatformActions(
  raw: z.infer<typeof chatIntentSchema>["platformActions"],
): Promise<AutomationAction[]> {
  if (!raw?.length) return [];
  const actions: AutomationAction[] = [];
  for (const item of raw) {
    const intent = normalizeAutomationIntent(item.intent);
    if (!intent) continue;
    const enabled = await isAutomationIntentEnabled(intent);
    if (!enabled) continue;
    actions.push({
      intent,
      params: item.params,
    });
  }
  return actions;
}

async function filterEnabledActions(actions: AutomationAction[]): Promise<AutomationAction[]> {
  const enabled: AutomationAction[] = [];
  for (const action of actions) {
    const intent = normalizeAutomationIntent(action.intent);
    if (!intent) continue;
    if (!(await isAutomationIntentEnabled(intent))) continue;
    enabled.push({ intent, params: action.params });
  }
  return enabled;
}
function buildConversationPrompt(
  messages: z.infer<typeof messageSchema>[],
  currentUiSchema: z.infer<typeof appBuilderUiSchema> | null | undefined,
): string {
  const lines = messages.map((m) => {
    const role = m.role === "user" ? "User" : "Assistant";
    return `${role}: ${m.content.trim()}`;
  });
  const context =
    currentUiSchema != null
      ? `\n\nCurrent app in preview (JSON):\n${JSON.stringify(currentUiSchema)}`
      : "\n\nNo app in preview yet.";
  return `${lines.join("\n\n")}${context}`;
}

export const POST = withWorkspacesAuth(
  async (_req, { orgId, userId, role }, data) => {
    try {
      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable("מנוע AI לא מוגדר", "gemini_not_configured");
      }

      const orgRl = await checkRateLimit(`ai-builder-chat:org:${orgId}`, ORG_REQUESTS_PER_HOUR, 60 * 60 * 1000);
      if (!orgRl.success) {
        return jsonTooManyRequests("חרגת ממכסת צ׳אט מחולל לשעה", "rate_limited", {
          resetAt: orgRl.resetAt,
        });
      }

      const locale = data.locale ?? (await getServerLocale());
      const lastUser = [...data.messages].reverse().find((m) => m.role === "user");
      if (!lastUser) {
        return jsonBadRequest("חסרה הודעת משתמש", "missing_user_message");
      }

      const system = [
        // ── New identity: unrestricted visual/UI expert ───────────────────────
        "You are an elite, unrestricted frontend React and Tailwind CSS expert inside the BSD-YBM App Builder.",
        "You are capable of building ANY visual component or application the user requests —",
        "including clocks, calculators, games, charts, animations, intricate visual layouts,",
        "and traditional enterprise tools like forms, tables, dashboards, and kanban boards.",
        "NEVER refuse a UI request. NEVER say something is 'beyond capabilities'.",
        "If the user asks for a clock, build a beautiful animated analog clock.",
        "If the user asks for a game, build a working game. Always set generateApp=true for ANY visual request.",
        "",
        // ── Platform routing (still relevant for CRM/scan/invoice shortcuts) ──
        APP_BUILDER_CHAT_SYSTEM_PROMPT,
        "",
        appBuilderCapabilitiesForPrompt(locale),
        "",
        aiReplyLanguageRule(locale),
      ].join("\n");

      const conversation = buildConversationPrompt(data.messages, data.currentUiSchema);

      const { object: intent } = await generateObject({
        model: google(MODEL),
        system,
        schema: chatIntentSchema,
        prompt: conversation,
      });

      let uiSchema: z.infer<typeof appBuilderUiSchema> | undefined;
      let schemaError: string | undefined;
      let jsxCode: string | undefined;

      // Fallback: model wanted to build/refine but forgot to fill appPrompt.
      // Use the last user message so an edit request never silently no-ops.
      const effectiveAppPrompt =
        intent.appPrompt?.trim() ||
        (intent.generateApp ? lastUser.content.trim() : "");

      if (intent.generateApp && effectiveAppPrompt) {
        // ── 1. JSON schema path (legacy, for schema-typed apps) ──────────────
        const generatorPrompt =
          data.currentUiSchema != null
            ? buildRefinePrompt(effectiveAppPrompt, data.currentUiSchema)
            : effectiveAppPrompt;

        const sanitized = await generateUiSchemaFromPrompt(generatorPrompt, locale);
        if (sanitized.ok) {
          uiSchema = sanitized.schema;
        } else {
          log.warn("chat_ui_schema_rejected", { error: sanitized.error, orgId });
          schemaError = "schema_rejected";
        }

        // ── 2. JSX code path (Sandpack dynamic renderer) ─────────────────────
        try {
          const jsxSystemPrompt = [
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

          const { text } = await generateText({
            model: google(MODEL),
            system: jsxSystemPrompt,
            prompt: effectiveAppPrompt,
            maxOutputTokens: 8192,
          });

          // ── Robust markdown fence extractor ──────────────────────────────────
          // Priority 1: extract content from inside ```lang ... ``` blocks
          // Priority 2: strip any leading/trailing fence lines
          // Priority 3: trim whitespace
          let cleanCode = text;

          // Greedy match: opening fence → LAST closing fence (prevents stopping early on template literals)
          const fenceMatch = cleanCode.match(/```(?:jsx?|tsx?|typescript|javascript|react)?\s*([\s\S]*)```/i);
          if (fenceMatch?.[1]) {
            cleanCode = fenceMatch[1];
          } else {
            // No closing fence — strip any opening fence line if present
            cleanCode = cleanCode
              .replace(/^```(?:jsx?|tsx?|typescript|javascript|react)?\s*/im, "")
              .replace(/```\s*$/m, "");
          }
          // Strip any residual lone trailing backtick left by partial fence extraction
          cleanCode = cleanCode.replace(/(?<![`])(`)\s*$/, "").trim();

          // Safety: ensure the code starts with a valid React statement
          if (!cleanCode.startsWith("import") && !cleanCode.startsWith("export") && !cleanCode.startsWith("const") && !cleanCode.startsWith("function")) {
            // Model prepended prose — find the first real code line
            const codeStart = cleanCode.search(/^(?:import |export |const |function )/m);
            if (codeStart !== -1) cleanCode = cleanCode.slice(codeStart).trim();
          }

          jsxCode = cleanCode;
          log.info("chat_jsx_generated", { orgId, chars: jsxCode.length });
        } catch (jsxErr: unknown) {
          log.warn("chat_jsx_generation_failed", {
            error: jsxErr instanceof Error ? jsxErr.message : String(jsxErr),
            orgId,
          });
          // Non-fatal — the uiSchema path can still serve the preview
        }
      }

      // When the AI decided to build a UI, never trigger OS automation actions —
      // the user is in the App Builder and wants to BUILD, not navigate the OS.
      let clientActions: AutomationAction[] = [];
      if (!intent.generateApp) {
        clientActions = await resolvePlatformActions(intent.platformActions);
        if (clientActions.length === 0 && lastUser.content.trim()) {
          const parsed = await parseOsActionMessage(userId, orgId, role, lastUser.content);
          if (parsed.actions?.length) {
            clientActions = await filterEnabledActions(parsed.actions);
          }
        }
      }

      return NextResponse.json({
        reply: intent.reply,
        uiSchema,
        jsxCode,                        // ← NEW: raw JSX for Sandpack renderer
        schemaApplied: uiSchema != null,
        schemaError,
        clientActions,
        actionsExecuted: clientActions.length,
      });
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/ai-builder/chat");
    }
  },
  {
    schema: bodySchema,
    rateLimit: { key: "ai:app-builder-chat", limit: 30, windowMs: 60_000 },
  },
);
