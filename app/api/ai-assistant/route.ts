import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonForbidden,
  jsonServerError,
  jsonServiceUnavailable,
  jsonUnauthorized,
} from "@/lib/api-json";
import {
  getUserFacingAiErrorMessage,
  runWorkspaceAssistant,
} from "@/lib/ai/workspace-assistant";
import { isAnyAiChatProviderConfigured } from "@/lib/ai-providers";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    const body = await req.json();
    const { message, orgId, provider: providerBody, sectionLabel, sectionSummary } = body as {
      message?: string;
      orgId?: string;
      provider?: string;
      sectionLabel?: string;
      sectionSummary?: string;
    };

    if (!message) {
      return jsonBadRequest("חסר message בבקשה", "missing_message");
    }

    const effectiveOrgId = orgId ?? session.user.organizationId ?? undefined;

    if (effectiveOrgId && effectiveOrgId !== session.user.organizationId) {
      return jsonForbidden("אין גישה לארגון זה.");
    }

    if (!isAnyAiChatProviderConfigured()) {
      return jsonServiceUnavailable(
        "לא הוגדרו מפתחות AI בשרת. ב-Vercel הוסיפו לפחות אחד: GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY או ANTHROPIC_API_KEY.",
        "ai_not_configured",
      );
    }

    const org = effectiveOrgId
      ? await prisma.organization.findUnique({
          where: { id: effectiveOrgId },
          select: { industry: true, constructionTrade: true },
        })
      : null;

    const { answer, provider: resolvedProvider } = await runWorkspaceAssistant({
      provider: providerBody,
      message,
      orgId: effectiveOrgId,
      sectionLabel: sectionLabel?.trim() || "מרחב עבודה",
      sectionSummary: sectionSummary?.trim(),
      userName: session.user.name?.trim() || session.user.email || "המשתמש",
      industry: org?.industry || "CONSTRUCTION",
      constructionTrade: org?.constructionTrade || "GENERAL_CONTRACTOR",
    });

    return NextResponse.json({ answer, provider: resolvedProvider });
  } catch (error) {
    console.error("AI assistant error:", error);
    return jsonServerError(getUserFacingAiErrorMessage(error));
  }
}
