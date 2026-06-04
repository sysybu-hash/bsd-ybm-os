import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getGeminiModelFallbackChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";

const log = createLogger("crm-semantic-search");
import { getServerLocale } from "@/lib/i18n/server";
import { aiJsonOnlyHint } from "@/lib/i18n/ai-locale";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  searchContactsByEmbedding,
  syncContactEmbeddingsForOrg,
} from "@/lib/crm/contact-embedding-index";
import { isEmbeddingConfigured } from "@/lib/embeddings/gemini-embed";

export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "crm:semantic-search", 20, 60_000);
  if (limited) return limited;

  try {
    const { query } = (await req.json()) as { query?: string };
    const q = typeof query === "string" ? query.trim() : "";
    if (!q) return NextResponse.json({ matchedIds: [], fallback: false });

    const locale = await getServerLocale();

    if (isEmbeddingConfigured()) {
      await syncContactEmbeddingsForOrg(orgId);
      const vectorIds = await searchContactsByEmbedding(orgId, q, 30);
      if (vectorIds.length > 0) {
        return NextResponse.json({ matchedIds: vectorIds, fallback: false, mode: "embedding" });
      }
    }

    const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ matchedIds: [], fallback: true });
    }

    const contacts = await prisma.contact.findMany({
      where: { organizationId: orgId },
      include: {
        issuedDocuments: {
          select: { status: true, total: true, dueDate: true },
        },
      },
      take: 100,
    });

    const systemPrompt = `
You are a semantic search engine for a CRM.
You receive a JSON list of contacts. Return only the string IDs of contacts matching the user description.
User query: "${q}"

${aiJsonOnlyHint(locale)}
Example: ["id1", "id2"]
`;

    const payload = JSON.stringify(
      contacts.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        value: c.value,
        notes: c.notes,
        pendingInvoicesCount: c.issuedDocuments.filter((d) => d.status === "PENDING").length,
      })),
    );

    const genAI = new GoogleGenerativeAI(apiKey);
    let matchedIds: string[] = [];
    let lastErr: unknown = null;

    for (const modelName of getGeminiModelFallbackChain()) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([systemPrompt, payload]);
        const text = result.response.text().trim();
        matchedIds = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]") as string[];
        break;
      } catch (e) {
        lastErr = e;
        if (isLikelyGeminiModelUnavailable(e)) continue;
        log.error("semantic search model error", { modelName, error: e instanceof Error ? e.message : String(e) });
        break;
      }
    }

    if (lastErr && matchedIds.length === 0 && isLikelyGeminiModelUnavailable(lastErr)) {
      return NextResponse.json({ matchedIds: [], fallback: true });
    }
    return NextResponse.json({ matchedIds, fallback: false });
  } catch (error) {
    return apiErrorResponse(error, "Semantic Search API Error");
  }
});
