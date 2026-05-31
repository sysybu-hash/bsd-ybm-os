import { generateText, stepCountIs } from "ai";
import { env } from "@/lib/env";
import { google } from "@ai-sdk/google";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withOSAdmin } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonServiceUnavailable } from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { getGeminiModelId } from "@/lib/gemini-model";
import { buildAdminAssistantSystemPrompt } from "@/lib/admin-assistant/system-prompt";
import {
  resetRequestPendingActions,
  setAdminAssistantRequestEmail,
  takeRequestPendingActions,
} from "@/lib/admin-assistant/pending-actions";
import { adminAssistantTools, consumeAdminNavigationHint } from "@/lib/admin-assistant/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL =
  env.GEMINI_ADMIN_ASSISTANT_MODEL?.trim() ||
  env.GOOGLE_GENERATIVE_AI_MODEL?.trim() ||
  getGeminiModelId();

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  locale: z.string().optional(),
});

export const POST = withOSAdmin(async (req, { email: adminEmail }) => {
  try {
    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable("Gemini לא מוגדר", "gemini_not_configured");
    }

    resetRequestPendingActions();
    setAdminAssistantRequestEmail(adminEmail);

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonBadRequest("גוף הבקשה לא תקין", "invalid_body");
    }

    const conversation = parsed.data.messages
      .map((m) => `${m.role === "user" ? "משתמש" : "עוזר"}: ${m.content}`)
      .join("\n\n");

    const { text } = await generateText({
      model: google(MODEL),
      system: buildAdminAssistantSystemPrompt(),
      prompt: conversation,
      tools: adminAssistantTools,
      stopWhen: stepCountIs(5),
    });

    const navigation = consumeAdminNavigationHint();
    const pendingActions = takeRequestPendingActions();

    return NextResponse.json({
      text: text.trim() || "לא התקבלה תשובה.",
      navigation,
      pendingActions,
    });
  } catch (error) {
    return apiErrorResponse(error, "admin/assistant");
  }
});
