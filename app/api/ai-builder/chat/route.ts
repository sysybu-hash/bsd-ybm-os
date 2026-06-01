import { generateObject } from "ai";
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
    .describe("True when the user wants to create or modify the app UI in the preview"),
  appPrompt: z
    .string()
    .optional()
    .describe("Detailed instructions for the JSON UI generator when generateApp is true"),
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

      // Fallback: model wanted to build/refine but forgot to fill appPrompt.
      // Use the last user message so an edit request never silently no-ops.
      const effectiveAppPrompt =
        intent.appPrompt?.trim() ||
        (intent.generateApp ? lastUser.content.trim() : "");

      if (intent.generateApp && effectiveAppPrompt) {
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
      }

      let clientActions = await resolvePlatformActions(intent.platformActions);

      if (clientActions.length === 0 && lastUser.content.trim()) {
        const parsed = await parseOsActionMessage(userId, orgId, role, lastUser.content);
        if (parsed.actions?.length) {
          clientActions = await filterEnabledActions(parsed.actions);
        }
      }

      return NextResponse.json({
        reply: intent.reply,
        uiSchema,
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
