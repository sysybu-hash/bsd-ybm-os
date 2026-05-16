import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonUnauthorized } from "@/lib/api-json";
import { runAiChat, getUserFacingAiErrorMessage } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { interpretDoneFallback } from "@/lib/i18n/ai-locale";
import { getApiMessage } from "@/lib/i18n/api-messages";
import { buildOsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { normalizeWidgetAction, widgetCatalogForPrompt } from "@/lib/os-assistant/widget-catalog";
import type { WidgetType } from "@/hooks/use-window-manager";

export const dynamic = "force-dynamic";

type InterpretResult = {
  reply: string;
  openWidgets: WidgetType[];
  searchQuery: string | null;
};

function parseInterpretJson(raw: string, locale: string): InterpretResult | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const reply = typeof o.reply === "string" ? o.reply.trim() : "";
    const openWidgets: WidgetType[] = [];
    if (Array.isArray(o.openWidgets)) {
      for (const item of o.openWidgets) {
        if (typeof item !== "string") continue;
        const w = normalizeWidgetAction(item);
        if (w) openWidgets.push(w);
      }
    }
    const searchQuery =
      typeof o.searchQuery === "string" && o.searchQuery.trim()
        ? o.searchQuery.trim()
        : null;
    return { reply: reply || interpretDoneFallback(locale), openWidgets, searchQuery };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let locale = "he";
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    const body = (await request.json()) as { message?: string };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    locale = await getServerLocale();

    if (!message) {
      return jsonBadRequest(getApiMessage("missing_message", locale));
    }

    const ctx = await buildOsAssistantUserContext(session);
    if (!ctx) {
      return jsonUnauthorized();
    }
    const loc = normalizeLocale(locale) as AppLocale;
    const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "Hebrew";

    const base = buildOsAssistantSystemInstruction(ctx, { locale });
    const task = [
      base,
      "",
      "## Task",
      `User message: «${message}»`,
      "",
      "Return JSON only (no markdown):",
      `{"reply":"answer in ${lang}","openWidgets":["widgetId"],"searchQuery":null}`,
      "",
      "Available widgets:",
      widgetCatalogForPrompt(locale),
      "",
      "Set openWidgets only when a screen should open. searchQuery only for in-app search.",
    ].join("\n");
    const { text } = await runAiChat("gemini", message, task, locale);
    const parsed = parseInterpretJson(text ?? "", locale);
    if (parsed) {
      return Response.json(parsed);
    }

    return Response.json({
      reply: text?.trim() || interpretDoneFallback(locale),
      openWidgets: [] as WidgetType[],
      searchQuery: null,
    } satisfies InterpretResult);
  } catch (err) {
    console.error("api/os/assistant/interpret:", err);
    return Response.json(
      { error: getUserFacingAiErrorMessage(err, locale) },
      { status: 500 },
    );
  }
}
