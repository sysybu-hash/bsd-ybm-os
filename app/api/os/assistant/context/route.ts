import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized } from "@/lib/api-json";
import {
  buildOsAssistantUserContext,
  formatUserContextForPrompt,
} from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { getServerLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return jsonUnauthorized();
  }

  const ctx = await buildOsAssistantUserContext(session);
  if (!ctx) {
    return jsonUnauthorized();
  }

  const locale = await getServerLocale();

  return Response.json({
    context: ctx,
    contextText: formatUserContextForPrompt(ctx),
    systemInstruction: buildOsAssistantSystemInstruction(ctx, { locale }),
    systemInstructionVoice: buildOsAssistantSystemInstruction(ctx, { voice: true, locale }),
  });
}
