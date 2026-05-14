import { CompanyType } from "@prisma/client";

export type DocumentHeaderOrg = {
  isReportable: boolean;
  companyType: CompanyType;
  taxId: string | null;
};

/** כותרות להדפסת מסמך מונפק — מבוקר מול אישי */
export function getDocumentHeader(org: DocumentHeaderOrg): {
  title: string;
  subTitle: string;
  showTax: boolean;
  isInternalMemo: boolean;
} {
  if (!org.isReportable) {
    return {
      title: "מזכר הוצאה / הכנסה פנימי (ללא דיווח מס)",
      subTitle: "ניהול פנימי — BSD-YBM Private",
      showTax: false,
      isInternalMemo: true,
    };
  }

  const taxLine = org.taxId?.trim() ? `ח.פ / ע.מ: ${org.taxId.trim()}` : "ח.פ / ע.מ: —";

  if (org.companyType === CompanyType.EXEMPT_DEALER) {
    return {
      title: "קבלה / מסמך עוסק פטור",
      subTitle: taxLine,
      showTax: true,
      isInternalMemo: false,
    };
  }

  return {
    title: "חשבונית מס / מסמך מורשה",
    subTitle: taxLine,
    showTax: true,
    isInternalMemo: false,
  };
}
