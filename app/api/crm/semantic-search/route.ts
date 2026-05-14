import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getGeminiModelFallbackChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import { jsonBadRequest, jsonUnauthorized } from "@/lib/api-json";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonUnauthorized();

    const { query } = await req.json();
    const orgId = session.user.organizationId;
    if (!orgId) return jsonBadRequest("לא נמצא ארגון במסגרת המשתמש", "no_org");

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
      אתה מנוע חיפוש סמנטי עבור מערכת CRM.
      נתונה רשימת לקוחות בפורמט JSON. המשימה שלך היא להחזיר רק את ה-ID של הלקוחות שמתאימים לתיאור של המשתמש.
      תיאור משתמש: "${query}"
      
      חובה להחזיר רק רשימת IDs בפורמט JSON Array של Strings. אל תוסיף הסברים.
      דוגמה לפורמט: ["id1", "id2"]
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
    console.error("Semantic Search API Error:", error);
    return NextResponse.json({ matchedIds: [] });
  }
}
