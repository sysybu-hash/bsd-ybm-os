import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonForbidden, jsonServiceUnavailable } from "@/lib/api-json";
import { runWorkspaceAssistant } from "@/lib/ai/workspace-assistant";
import { isAnyAiChatProviderConfigured } from "@/lib/ai-providers";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const assistantBodySchema = z.object({
  message: z.string().min(1),
  orgId: z.string().optional(),
  provider: z.string().optional(),
  sectionLabel: z.string().optional(),
  sectionSummary: z.string().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, ctx, data) => {
    try {
      const effectiveOrgId = data.orgId ?? ctx.orgId;

      if (effectiveOrgId !== ctx.orgId) {
        return jsonForbidden("אין גישה לארגון זה.");
      }

      if (!isAnyAiChatProviderConfigured()) {
        return jsonServiceUnavailable(
          "לא הוגדרו מפתחות AI בשרת. ב-Vercel הוסיפו לפחות אחד: GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY או ANTHROPIC_API_KEY.",
          "ai_not_configured",
        );
      }

      const [org, userRow] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: effectiveOrgId },
          select: { industry: true, constructionTrade: true },
        }),
        prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { name: true, email: true },
        }),
      ]);

      const { answer, provider: resolvedProvider } = await runWorkspaceAssistant({
        provider: data.provider,
        message: data.message,
        orgId: effectiveOrgId,
        sectionLabel: data.sectionLabel?.trim() || "מרחב עבודה",
        sectionSummary: data.sectionSummary?.trim(),
        userName: userRow?.name?.trim() || userRow?.email || "המשתמש",
        industry: org?.industry || "CONSTRUCTION",
        constructionTrade: org?.constructionTrade || "GENERAL_CONTRACTOR",
      });

      return NextResponse.json({ answer, provider: resolvedProvider });
    } catch (err: unknown) {
      return apiErrorResponse(err, "AI assistant error");
    }
  },
  { schema: assistantBodySchema },
);
