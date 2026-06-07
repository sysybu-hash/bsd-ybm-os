import type { CompanyType } from "@prisma/client";

/** תווית קצרה לשורת מזהה מס במסמך מונפק — לפי סוג ישות */
export function getOrgTaxIdLabelShort(companyType?: CompanyType | string | null): string {
  switch (companyType) {
    case "LTD_COMPANY":
      return "ח.פ";
    case "EXEMPT_DEALER":
    case "LICENSED_DEALER":
      return "ע.מ";
    default:
      return "ע.מ";
  }
}

export function formatOrgTaxIdLine(
  taxId: string | null | undefined,
  companyType?: CompanyType | string | null,
): string | null {
  const trimmed = taxId?.trim();
  if (!trimmed) return null;
  return `${getOrgTaxIdLabelShort(companyType)}: ${trimmed}`;
}
