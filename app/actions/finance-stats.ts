"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadFinanceForecast, type FinanceForecast } from "@/lib/finance-forecast";

export type CashFlowData = FinanceForecast;

/** תחזית פיננסית משולבת CRM + ERP */
export async function getFinancialForecastAction(): Promise<CashFlowData> {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!orgId) return { actual: 0, pending: 0, forecast: 0, totalProjected: 0 };
  return loadFinanceForecast(orgId);
}
