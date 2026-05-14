import { prisma } from "@/lib/prisma";

export type FinanceForecast = {
  actual: number;
  pending: number;
  forecast: number;
  totalProjected: number;
};

/** תחזית CRM + נתוני מסמכים מונפקים — סטטוסים מיושרים ל־CRM במערכת */
export async function loadFinanceForecast(organizationId: string): Promise<FinanceForecast> {
  const issuedDocs = await prisma.issuedDocument.findMany({
    where: { organizationId },
    select: { total: true, status: true },
  });

  const actual = issuedDocs.filter((d) => d.status === "PAID").reduce((sum, d) => sum + d.total, 0);
  const pending = issuedDocs.filter((d) => d.status === "PENDING").reduce((sum, d) => sum + d.total, 0);

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      status: { in: ["LEAD", "ACTIVE", "PROPOSAL"] },
    },
    select: { value: true, status: true },
  });

  const statusProbability: Record<string, number> = {
    LEAD: 0.15,
    ACTIVE: 0.35,
    PROPOSAL: 0.65,
  };

  const forecast = contacts.reduce((sum, c) => {
    const prob = statusProbability[c.status] ?? 0;
    return sum + ((c.value ?? 0) * prob);
  }, 0);

  const forecastRounded = Math.round(forecast);
  return {
    actual,
    pending,
    forecast: forecastRounded,
    totalProjected: Math.round(actual + pending + forecastRounded),
  };
}
