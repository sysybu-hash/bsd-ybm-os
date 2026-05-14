import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getGeminiModelFallbackChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";

export async function generateAndStoreInsightForOrganization(
  organizationId: string,
): Promise<void> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || !organizationId) return;

  const [docs, contacts] = await Promise.all([
    prisma.document.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  const payload = {
    orgName: org?.name,
    documents: docs.map((d) => ({
      fileName: d.fileName,
      type: d.type,
      aiData: d.aiData,
      createdAt: d.createdAt,
    })),
    contacts: contacts.map((c) => ({
      name: c.name,
      status: c.status,
      email: c.email,
    })),
  };

  const prompt = `
אתה יועץ פיננסי של BSD-YBM. לפי הנתונים הבאים (JSON), כתוב 3–6 משפטים קצרים בעברית:
- מגמות הוצאות (השוואה לממוצע אם אפשר להסיק מהנתונים)
- התראות (למשל חשמל גבוה מהרגיל)
- CRM: אם יש לקוחות עם סטטוס LEAD/הצעת מחיר ללא מענה מזה שבוע – ציין זאת
חתום בשם "BSD-YBM" בלבד, בלי סימני מרקדון מעבר לנקודות.

נתונים:
${JSON.stringify(payload).slice(0, 120000)}
`;

  const genAI = new GoogleGenerativeAI(apiKey);
  let content = "";
  let lastErr: unknown = null;
  for (const modelName of getGeminiModelFallbackChain()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) {
        content = text;
        break;
      }
    } catch (e) {
      lastErr = e;
      if (isLikelyGeminiModelUnavailable(e)) continue;
      throw e;
    }
  }
  if (!content.trim()) {
    throw lastErr instanceof Error ? lastErr : new Error("Gemini: כל המודלים נכשלו");
  }

  await prisma.financialInsight.upsert({
    where: { organizationId },
    create: { organizationId, content },
    update: { content },
  });
}

export async function runDailyInsightsForAllOrganizations(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const o of orgs) {
    try {
      await generateAndStoreInsightForOrganization(o.id);
    } catch (e) {
      console.error("Insight failed for org", o.id, e);
    }
  }
}
