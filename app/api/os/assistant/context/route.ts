import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonUnauthorized } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import {
  buildOsAssistantUserContext,
  formatUserContextForPrompt,
} from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { getServerLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { AUTOMATION_CATALOG } from "@/lib/os-automations/catalog";
import { getPlatformConfig } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (_req, ctx) => {
  try {
    const userRow = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    const session = {
      user: {
        id: ctx.userId,
        organizationId: ctx.orgId,
        role: ctx.role,
        email: userRow?.email ?? null,
      },
    } as Session;

    const assistantCtx = await buildOsAssistantUserContext(session);
    if (!assistantCtx) {
      return jsonUnauthorized();
    }

    const locale = await getServerLocale();
    const platform = await getPlatformConfig();
    const enabledAutomationIntents = AUTOMATION_CATALOG.filter(
      (entry) => platform.automationEnabled[entry.id] !== false,
    ).map((entry) => entry.id);

    return NextResponse.json({
      context: assistantCtx,
      contextText: formatUserContextForPrompt(assistantCtx),
      systemInstruction: buildOsAssistantSystemInstruction(assistantCtx, { locale }),
      systemInstructionVoice: buildOsAssistantSystemInstruction(assistantCtx, { voice: true, locale }),
      geminiLiveAllowed:
        platform.featureFlags.geminiLiveEnabled && !platform.maintenanceMode,
      enabledAutomationIntents,
    });
  } catch (err) {
    return apiErrorResponse(err, "os/assistant/context");
  }
});
