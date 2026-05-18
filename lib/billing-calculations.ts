import type { CompanyType as PrismaCompanyType } from "@prisma/client";
import { payPlusFeeIls } from "@/lib/crm-client-ai";
import { DEFAULT_VAT_RATE_PERCENT, resolveVatRatePercent, vatRateDecimal } from "@/lib/vat-config";

/** @deprecated השתמשו ב-resolveVatRatePercent — נשמר לתאימות */
export const VAT_RATE = vatRateDecimal(DEFAULT_VAT_RATE_PERCENT);

export const COMPANY_TYPE = {
  EXEMPT_DEALER: "EXEMPT_DEALER",
  LICENSED_DEALER: "LICENSED_DEALER",
  LTD_COMPANY: "LTD_COMPANY",
} as const satisfies Record<string, PrismaCompanyType>;

export type CompanyType = PrismaCompanyType;

export function calculateTotals(
  netAmount: number,
  type: CompanyType,
  vatRatePercent: number = DEFAULT_VAT_RATE_PERCENT,
) {
  const isExempt = type === COMPANY_TYPE.EXEMPT_DEALER;
  const rate = vatRateDecimal(resolveVatRatePercent(vatRatePercent));
  const vat = isExempt ? 0 : Math.round(netAmount * rate * 100) / 100;

  return {
    net: netAmount,
    vat,
    total: Math.round((netAmount + vat) * 100) / 100,
    isExempt,
    vatRatePercent: resolveVatRatePercent(vatRatePercent),
  };
}

export function calculateIssuedDocumentTotals(
  netAmount: number,
  companyType: CompanyType,
  isReportable: boolean,
  vatRatePercent: number = DEFAULT_VAT_RATE_PERCENT,
) {
  if (!isReportable) {
    return {
      net: netAmount,
      vat: 0,
      total: netAmount,
      isExempt: true,
      isInternalMemo: true as const,
      vatRatePercent: 0,
    };
  }

  const base = calculateTotals(netAmount, companyType, vatRatePercent);
  return { ...base, isInternalMemo: false as const };
}

export function calculateDocumentTotalsFromOrg(
  netAmount: number,
  org: {
    companyType: CompanyType;
    isReportable: boolean;
    vatRatePercent: number | null;
  },
) {
  return calculateIssuedDocumentTotals(
    netAmount,
    org.companyType,
    org.isReportable,
    resolveVatRatePercent(org.vatRatePercent),
  );
}

export function calculatePayPlusNet(grossAmount: number) {
  return payPlusFeeIls(grossAmount);
}
