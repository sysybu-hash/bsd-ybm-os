import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { getGeminiModelFallbackChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import { getServerLocale } from "@/lib/i18n/server";
import { aiJsonOnlyHint } from "@/lib/i18n/ai-locale";

export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  try {
    const { query } = await req.json();
    const locale = await getServerLocale();

    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ matchedIds: [] });
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
User query: "${query}"

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
        console.error("Semantic Search model error:", modelName, e);
        break;
      }
    }

    void lastErr;
    return NextResponse.json({ matchedIds });
  } catch (error) {
    return apiErrorResponse(error, "Semantic Search API Error");
  }
});
