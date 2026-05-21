import type { DocType } from "@prisma/client";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import type { ProjectSubDomainId } from "@/lib/project-sub-domains";

/** מזהה תבנית פנימי (לא בהכרח DocType של ERP) */
export type ProjectDocTemplateId =
  | "PURCHASE_ORDER"
  | "WORK_DIARY"
  | "PROGRESS_REPORT"
  | "BOQ_SHEET"
  | "ORDER_AGREEMENT"
  | "DELIVERY_NOTE";

export type ProjectDocumentCatalogEntry = {
  id: string;
  labelHe: string;
  descriptionHe?: string;
  /** סוג מסמך מונפק ב-ERP — אם קיים */
  docType?: DocType;
  /** תבנית פנימית / ניווט */
  templateId?: ProjectDocTemplateId;
  /** תת-תחומים רלוונטיים; ריק = כללי */
  subDomains: ProjectSubDomainId[] | "ALL";
  color: "indigo" | "emerald" | "amber" | "sky" | "violet" | "rose" | "slate";
};

export const COMPANY_MGMT_DOCUMENT_CATALOG: ProjectDocumentCatalogEntry[] = [
  {
    id: "quote",
    labelHe: "הצעת מחיר",
    docType: "QUOTE",
    subDomains: "ALL",
    color: "indigo",
  },
  {
    id: "invoice",
    labelHe: "חשבונית",
    docType: "INVOICE",
    subDomains: "ALL",
    color: "emerald",
  },
  {
    id: "invoice_receipt",
    labelHe: "חשבונית מס קבלה",
    docType: "INVOICE_RECEIPT",
    subDomains: "ALL",
    color: "violet",
  },
  {
    id: "receipt",
    labelHe: "קבלה",
    docType: "RECEIPT",
    subDomains: ["GENERAL", "FINANCE", "SALES"],
    color: "amber",
  },
  {
    id: "purchase_order",
    labelHe: "הזמנת רכש",
    templateId: "PURCHASE_ORDER",
    subDomains: "ALL",
    color: "slate",
  },
  {
    id: "status_report",
    labelHe: "דוח סטטוס / ביצוע",
    templateId: "PROGRESS_REPORT",
    subDomains: ["OPERATIONS", "PRODUCT", "GENERAL"],
    color: "sky",
  },
  {
    id: "service_contract",
    labelHe: "חוזה שירות",
    templateId: "ORDER_AGREEMENT",
    docType: "QUOTE",
    subDomains: ["SALES", "OPERATIONS", "GENERAL"],
    color: "violet",
  },
  {
    id: "delivery_note",
    labelHe: "תעודת משלוח",
    templateId: "DELIVERY_NOTE",
    subDomains: ["OPERATIONS", "GENERAL"],
    color: "amber",
  },
];

export const CONSTRUCTION_DOCUMENT_CATALOG: ProjectDocumentCatalogEntry[] = [
  {
    id: "quote",
    labelHe: "הצעת מחיר",
    docType: "QUOTE",
    subDomains: "ALL",
    color: "indigo",
  },
  {
    id: "progress_bill",
    labelHe: "חשבון התקדמות",
    descriptionHe: "חשבונית עסקה / חשבון ביניים",
    docType: "TRANSACTION_INVOICE",
    subDomains: "ALL",
    color: "sky",
  },
  {
    id: "invoice",
    labelHe: "חשבונית",
    docType: "INVOICE",
    subDomains: "ALL",
    color: "emerald",
  },
  {
    id: "invoice_receipt",
    labelHe: "חשבונית מס קבלה",
    docType: "INVOICE_RECEIPT",
    subDomains: "ALL",
    color: "violet",
  },
  {
    id: "receipt",
    labelHe: "קבלה",
    docType: "RECEIPT",
    subDomains: ["GENERAL"],
    color: "amber",
  },
  {
    id: "purchase_order",
    labelHe: "הזמנת רכש",
    templateId: "PURCHASE_ORDER",
    subDomains: "ALL",
    color: "slate",
  },
  {
    id: "work_diary",
    labelHe: "יומן עבודה",
    templateId: "WORK_DIARY",
    subDomains: "ALL",
    color: "emerald",
  },
  {
    id: "progress_report",
    labelHe: "דוח התקדמות",
    templateId: "PROGRESS_REPORT",
    subDomains: "ALL",
    color: "sky",
  },
  {
    id: "boq",
    labelHe: "כתב כמויות",
    templateId: "BOQ_SHEET",
    subDomains: "ALL",
    color: "indigo",
  },
  {
    id: "order_agreement",
    labelHe: "הסכם / הזמנה",
    templateId: "ORDER_AGREEMENT",
    docType: "QUOTE",
    subDomains: "ALL",
    color: "violet",
  },
  {
    id: "delivery_note",
    labelHe: "תעודת משלוח",
    templateId: "DELIVERY_NOTE",
    subDomains: "ALL",
    color: "amber",
  },
];

/** @deprecated Use getProjectDocumentCatalogForIndustry */
export const PROJECT_DOCUMENT_CATALOG = CONSTRUCTION_DOCUMENT_CATALOG;

export function getProjectDocumentCatalogForIndustry(
  industryRaw?: string | null,
): ProjectDocumentCatalogEntry[] {
  return isCompanyMgmtIndustry(industryRaw)
    ? COMPANY_MGMT_DOCUMENT_CATALOG
    : CONSTRUCTION_DOCUMENT_CATALOG;
}

export function catalogForSubDomain(
  domainId: ProjectSubDomainId | "ALL",
  industryRaw?: string | null,
): ProjectDocumentCatalogEntry[] {
  const catalog = getProjectDocumentCatalogForIndustry(industryRaw);
  if (domainId === "ALL") return catalog;
  return catalog.filter((e) => e.subDomains === "ALL" || e.subDomains.includes(domainId));
}

export type BoqLinePrefill = {
  id: string;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  lineTotal?: number;
};

export type BuildDocLiveDataInput = {
  projectId: string;
  projectName: string;
  contactId?: string | null;
  contactName?: string | null;
  entry: ProjectDocumentCatalogEntry;
  domainLabel?: string;
  boqLines?: BoqLinePrefill[];
};

export function buildDocumentCreatorLiveData(input: BuildDocLiveDataInput): Record<string, unknown> {
  const { entry, projectId, projectName, contactId, contactName, domainLabel, boqLines } = input;
  const prefix = domainLabel ? `${domainLabel} — ` : "";

  if (entry.templateId === "WORK_DIARY") {
    return {
      action: "open_work_diary",
      projectId,
      projectName,
      linkedTaskId: undefined,
    };
  }
  if (entry.templateId === "BOQ_SHEET") {
    return { action: "open_boq", projectId, projectName };
  }

  const itemsFromBoq =
    boqLines && boqLines.length > 0
      ? boqLines.slice(0, 40).map((line) => ({
          description: line.description,
          quantity: line.quantity ?? 1,
          price: line.unitPrice ?? (line.lineTotal && line.quantity ? line.lineTotal / line.quantity : 0),
        }))
      : [
          {
            description: `${prefix}${entry.labelHe} — ${projectName}`,
            quantity: 1,
            price: 0,
          },
        ];

  const base: Record<string, unknown> = {
    automation: "invoice_draft",
    projectId,
    projectName,
    contactId: contactId ?? undefined,
    contactName: contactName ?? undefined,
    templateId: entry.templateId ?? entry.id,
    domainLabel,
    items: itemsFromBoq,
  };

  if (entry.docType) base.docType = entry.docType;

  if (entry.templateId === "PURCHASE_ORDER") {
    base.items = [
      {
        description: `הזמנת רכש — ${prefix}${projectName}`,
        quantity: 1,
        price: 0,
      },
      ...itemsFromBoq.slice(0, 15),
    ];
  }
  if (entry.templateId === "DELIVERY_NOTE") {
    base.items = itemsFromBoq.length
      ? itemsFromBoq
      : [{ description: `תעודת משלוח — ${projectName}`, quantity: 1, price: 0 }];
  }
  if (entry.templateId === "PROGRESS_REPORT") {
    base.docType = "TRANSACTION_INVOICE";
    base.items = [
      { description: `דוח התקדמות — ${projectName}`, quantity: 1, price: 0 },
      ...itemsFromBoq.slice(0, 20),
    ];
  }
  if (entry.templateId === "ORDER_AGREEMENT") {
    base.docType = "QUOTE";
    base.items = [
      { description: `הסכם / הזמנה — ${projectName}`, quantity: 1, price: 0 },
      ...itemsFromBoq.slice(0, 10),
    ];
  }

  return base;
}
