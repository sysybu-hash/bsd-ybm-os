import { prisma } from "@/lib/prisma";

/** קטעי JSON של billOfQuantities ממסמכים אחרונים — הקשר לצ'אט מחברת פרויקטים. */
export async function loadRecentBillOfQuantitiesContext(
  organizationId: string,
  maxDocs = 8,
  maxChars = 48_000,
): Promise<string | null> {
  const docs = await prisma.document.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: maxDocs,
    select: { fileName: true, aiData: true },
  });

  const chunks: string[] = [];
  for (const d of docs) {
    const ai = d.aiData;
    if (!ai || typeof ai !== "object" || Array.isArray(ai)) continue;
    const rec = ai as Record<string, unknown>;
    const boq = rec.billOfQuantities;
    if (!Array.isArray(boq) || boq.length === 0) continue;
    const meta = rec.metadata;
    const projectHint =
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? JSON.stringify((meta as Record<string, unknown>).project ?? "").slice(0, 200)
        : "";
    const snippet = JSON.stringify(boq).slice(0, 14_000);
    chunks.push(
      `— קובץ: ${d.fileName}${projectHint ? ` · פרויקט (מטא): ${projectHint}` : ""}\n${snippet}`,
    );
  }

  if (!chunks.length) return null;

  const preamble = [
    "הנחיות שימוש בכמויות (BOQ) עבור ERP והתראות מחיר:",
    "- נרמל כל שורה ליחידת מידה סטנדרטית: m (אורך/גובה), m² (שטח), m³ (נפח), יח׳ / יחידה (פריטים, אריחים, דלתות), ק״ג / טון (משקל), שעה / יום (עבודה).",
    "- אם במקור מופיע ממד משורשר (למשל «קיר 15 מ׳», «קיר 3×2.5 מ׳»), חשב והצג quantity מספרי + unit מתאים (m או m² וכו׳), ושמור את הניסוח המקורי ב־description או dimensions.",
    "- אל תשאיר יחידות עמומות כמו «ריצה» בלי המרה — הוסף הערה ב־notes אם ההנחה לא בטוחה.",
    "",
  ].join("\n");

  return (preamble + chunks.join("\n\n")).slice(0, maxChars);
}
