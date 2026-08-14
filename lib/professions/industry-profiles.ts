import type { IndustryType } from "@/lib/professions/config";

/** טיפוסי תבנית מקצועית וטבלת פרופילי הענפים — פוצל מ-runtime.ts */
export type ProfessionalTemplateKind = "OFFICIAL" | "APPROVAL" | "FORM" | "REPORT";
export type OfficialIssuedDocumentType = "INVOICE" | "RECEIPT" | "INVOICE_RECEIPT" | "CREDIT_NOTE";

export type ProfessionalDocumentTemplate = {
  id: string;
  label: string;
  description: string;
  kind: ProfessionalTemplateKind;
  issuedDocumentType?: OfficialIssuedDocumentType;
};

export type IndustryProfileBase = {
  clientsLabel: string;
  documentsLabel: string;
  recordsLabel: string;
  /** ׳×׳•׳•׳™׳× ׳˜׳׳‘ ERP/׳›׳¡׳₪׳™׳ ג€” ׳›׳©׳׳ ׳׳•׳’׳“׳¨ ׳׳©׳×׳׳©׳™׳ ׳‘-documentsLabel */
  financeNavLabel?: string;
  homeTitle: string;
  homeDescription: string;
  templates: ProfessionalDocumentTemplate[];
};

export const INDUSTRY_PROFILES: Record<IndustryType, IndustryProfileBase> = {
  GENERAL: {
    clientsLabel: "׳׳§׳•׳—׳•׳×",
    documentsLabel: "׳׳¡׳׳›׳™׳",
    recordsLabel: "׳׳¡׳׳›׳™׳ ׳•׳׳™׳©׳•׳¨׳™׳",
    homeTitle: "׳׳¨׳›׳– ׳¢׳‘׳•׳“׳” ׳׳—׳“ ׳׳›׳ ׳”׳×׳”׳׳™׳ ׳”׳¢׳¡׳§׳™.",
    homeDescription: "׳›׳ ׳׳§׳•׳—, ׳׳¡׳׳ ׳•׳—׳™׳•׳‘ ׳׳¡׳×׳ ׳›׳¨׳ ׳™׳ ׳׳׳¡׳ ׳¢׳‘׳•׳“׳” ׳‘׳¨׳•׳¨ ׳©׳׳›׳•׳•׳ ׳׳¢׳¡׳§ ׳›׳׳׳™ ׳׳• ׳¨׳‘-׳×׳—׳•׳׳™.",
    templates: [
      { id: "INVOICE", label: "׳—׳©׳‘׳•׳ ׳™׳× ׳׳¡", description: "׳׳¡׳׳ ׳—׳™׳•׳‘ ׳¨׳©׳׳™ ׳׳׳§׳•׳—.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
      { id: "RECEIPT", label: "׳§׳‘׳׳”", description: "׳׳™׳©׳•׳¨ ׳×׳©׳׳•׳ ׳¨׳©׳׳™.", kind: "OFFICIAL", issuedDocumentType: "RECEIPT" },
      { id: "SERVICE_REPORT", label: "׳“׳•׳— ׳©׳™׳¨׳•׳×", description: "׳¡׳™׳›׳•׳ ׳‘׳™׳¦׳•׳¢ ׳׳• ׳˜׳™׳₪׳•׳ ׳₪׳ ׳™׳׳™.", kind: "REPORT" },
      { id: "WORK_APPROVAL", label: "׳׳™׳©׳•׳¨ ׳‘׳™׳¦׳•׳¢", description: "׳׳™׳©׳•׳¨ ׳₪׳ ׳™׳׳™ ׳׳• ׳׳•׳ ׳׳§׳•׳— ׳¢׳ ׳¡׳™׳•׳ ׳׳©׳™׳׳”.", kind: "APPROVAL" },
    ],
  },
  LEGAL: {
    clientsLabel: "׳׳™׳•׳¦׳’׳™׳ ׳•׳×׳™׳§׳™׳",
    documentsLabel: "׳×׳™׳§׳™׳ ׳•׳׳¡׳׳›׳™׳",
    recordsLabel: "׳׳¡׳׳›׳™׳ ׳׳©׳₪׳˜׳™׳™׳ ׳•׳׳™׳©׳•׳¨׳™׳",
    homeTitle: "׳׳¨׳—׳‘ ׳¢׳‘׳•׳“׳” ׳©׳׳“׳‘׳¨ ׳©׳₪׳” ׳׳©׳₪׳˜׳™׳×.",
    homeDescription: "׳”׳×׳₪׳¨׳™׳˜׳™׳, ׳”׳›׳•׳×׳¨׳•׳× ׳•׳”׳׳¡׳׳›׳™׳ ׳׳•׳×׳׳׳™׳ ׳׳ ׳™׳”׳•׳ ׳׳™׳•׳¦׳’׳™׳, ׳×׳™׳§׳™׳, ׳—׳•׳–׳™׳ ׳•׳׳™׳©׳•׳¨׳™׳ ׳׳©׳₪׳˜׳™׳™׳.",
    templates: [
      { id: "ENGAGEMENT_AGREEMENT", label: "׳”׳¡׳›׳ ׳™׳™׳¦׳•׳’", description: "׳׳¡׳׳ ׳₪׳×׳™׳—׳× ׳×׳™׳§ ׳•׳”׳×׳§׳©׳¨׳•׳× ׳¢׳ ׳׳§׳•׳—.", kind: "FORM" },
      { id: "COURT_FILING_APPROVAL", label: "׳׳™׳©׳•׳¨ ׳”׳’׳©׳” ׳׳‘׳™׳× ׳׳©׳₪׳˜", description: "׳׳™׳©׳•׳¨ ׳₪׳ ׳™׳׳™/׳—׳™׳¦׳•׳ ׳™ ׳׳”׳’׳©׳× ׳׳¡׳׳ ׳׳©׳₪׳˜׳™.", kind: "APPROVAL" },
      { id: "CASE_SUMMARY", label: "׳¡׳™׳›׳•׳ ׳×׳™׳§", description: "׳“׳•׳— ׳׳¦׳‘ ׳×׳™׳§, ׳׳•׳¢׳“׳™׳ ׳•׳¡׳™׳›׳•׳ ׳™׳.", kind: "REPORT" },
      { id: "INVOICE", label: "׳—׳©׳‘׳•׳ ׳™׳× ׳©׳›׳¨ ׳˜׳¨׳—׳”", description: "׳—׳™׳•׳‘ ׳¨׳©׳׳™ ׳¢׳ ׳©׳™׳¨׳•׳× ׳׳©׳₪׳˜׳™.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
  ACCOUNTING: {
    clientsLabel: "׳׳§׳•׳—׳•׳× ׳׳¡ ׳•׳‘׳™׳§׳•׳¨׳×",
    documentsLabel: "׳“׳•׳—׳•׳× ׳•׳׳¡׳׳›׳™ ׳—׳©׳‘׳•׳ ׳׳•׳×",
    recordsLabel: "׳“׳•׳—׳•׳×, ׳׳¡׳׳›׳™׳ ׳•׳׳™׳©׳•׳¨׳™ ׳׳¡",
    homeTitle: "׳׳¢׳¨׳›׳× ׳©׳׳•׳×׳׳׳× ׳׳׳©׳¨׳“ ׳—׳©׳‘׳•׳ ׳׳•׳× ׳₪׳¢׳™׳.",
    homeDescription: "׳”׳׳¡׳›׳™׳ ׳•׳”-AI ׳‘׳ ׳•׳™׳™׳ ׳׳ ׳™׳©׳•׳׳™׳, ׳“׳•׳—׳•׳×, ׳‘׳™׳§׳•׳¨׳•׳× ׳•׳׳™׳©׳•׳¨׳™ ׳׳¡ ׳‘׳׳§׳•׳ ׳׳•׳ ׳—׳™׳ ׳›׳׳׳™׳™׳.",
    templates: [
      { id: "BOOKKEEPING_REPORT", label: "׳¡׳™׳›׳•׳ ׳”׳ ׳”׳׳× ׳—׳©׳‘׳•׳ ׳•׳×", description: "׳¡׳™׳›׳•׳ ׳—׳•׳“׳©׳™ ׳׳• ׳×׳§׳•׳₪׳×׳™ ׳׳׳§׳•׳—.", kind: "REPORT" },
      { id: "TAX_APPROVAL", label: "׳׳™׳©׳•׳¨ ׳׳¡", description: "׳׳™׳©׳•׳¨ ׳”׳’׳©׳”, ׳×׳™׳׳•׳ ׳׳• ׳‘׳§׳¨׳” ׳׳׳§׳•׳—.", kind: "APPROVAL" },
      { id: "AUDIT_MEMO", label: "׳׳–׳›׳¨ ׳‘׳™׳§׳•׳¨׳×", description: "׳¡׳™׳›׳•׳ ׳׳׳¦׳׳™׳ ׳•׳₪׳¢׳•׳׳•׳× ׳׳×׳§׳ ׳•׳×.", kind: "REPORT" },
      { id: "INVOICE", label: "׳—׳©׳‘׳•׳ ׳™׳× ׳©׳™׳¨׳•׳×׳™ ׳”׳ ׳”׳׳× ׳—׳©׳‘׳•׳ ׳•׳×", description: "׳—׳™׳•׳‘ ׳¨׳©׳׳™ ׳¢׳‘׳•׳¨ ׳©׳™׳¨׳•׳×׳™ ׳”׳׳©׳¨׳“.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
  COMPANY_MGMT: {
    clientsLabel: "׳׳§׳•׳—׳•׳× ׳•׳©׳•׳×׳₪׳™׳",
    documentsLabel: "׳׳¡׳׳›׳™׳ ׳•׳—׳•׳–׳™׳",
    recordsLabel: "׳”׳¦׳¢׳•׳×, ׳—׳•׳–׳™׳ ׳•׳׳™׳©׳•׳¨׳™׳",
    financeNavLabel: "׳›׳¡׳₪׳™׳",
    homeTitle: "׳׳¨׳›׳– ׳¢׳‘׳•׳“׳” ׳׳ ׳™׳”׳•׳ ׳”׳¢׳¡׳§ ׳•׳”׳—׳‘׳¨׳”.",
    homeDescription:
      "׳׳§׳•׳—׳•׳×, ׳₪׳¨׳•׳™׳§׳˜׳™׳ ׳₪׳ ׳™׳׳™׳™׳, ׳׳¡׳׳›׳™׳ ׳•׳—׳™׳•׳‘׳™׳ ׳‘׳׳¡׳ ׳׳—׳“ ג€” ׳‘׳׳™ ׳©׳₪׳× ׳׳×׳¨׳™ ׳‘׳ ׳™׳™׳”.",
    templates: [
      {
        id: "QUOTE_PROPOSAL",
        label: "׳”׳¦׳¢׳× ׳׳—׳™׳¨",
        description: "׳”׳¦׳¢׳” ׳׳¡׳•׳“׳¨׳× ׳׳׳§׳•׳— ׳׳• ׳׳©׳•׳×׳£.",
        kind: "FORM",
      },
      {
        id: "SERVICE_CONTRACT",
        label: "׳—׳•׳–׳” ׳©׳™׳¨׳•׳×",
        description: "׳”׳¡׳›׳ ׳”׳×׳§׳©׳¨׳•׳× ׳•׳×׳ ׳׳™ ׳‘׳™׳¦׳•׳¢.",
        kind: "FORM",
      },
      {
        id: "ACTIVITY_REPORT",
        label: "׳“׳•׳— ׳‘׳™׳¦׳•׳¢ / ׳¡׳˜׳˜׳•׳¡",
        description: "׳¡׳™׳›׳•׳ ׳×׳§׳•׳₪׳×׳™ ׳׳• ׳“׳•׳— ׳₪׳¨׳•׳™׳§׳˜.",
        kind: "REPORT",
      },
      {
        id: "INTERNAL_APPROVAL",
        label: "׳׳™׳©׳•׳¨ ׳”׳ ׳”׳׳”",
        description: "׳׳™׳©׳•׳¨ ׳”׳•׳¦׳׳”, ׳¨׳›׳© ׳׳• ׳‘׳™׳¦׳•׳¢.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "׳—׳©׳‘׳•׳ ׳™׳× ׳׳¡",
        description: "׳—׳™׳•׳‘ ׳¨׳©׳׳™ ׳׳׳§׳•׳—.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
      {
        id: "RECEIPT",
        label: "׳§׳‘׳׳”",
        description: "׳׳™׳©׳•׳¨ ׳×׳©׳׳•׳.",
        kind: "OFFICIAL",
        issuedDocumentType: "RECEIPT",
      },
    ],
  },
  CONSTRUCTION: {
    clientsLabel: "׳₪׳¨׳•׳™׳§׳˜׳™׳",
    documentsLabel: "׳™׳•׳׳ ׳™׳, ׳×׳•׳›׳ ׳™׳•׳× ׳•׳׳¡׳׳›׳™ ׳©׳˜׳—",
    financeNavLabel: "׳›׳¡׳₪׳™׳",
    recordsLabel: "׳׳™׳©׳•׳¨׳™ ׳©׳˜׳— ׳•׳׳¡׳׳›׳™ ׳₪׳¨׳•׳™׳§׳˜",
    homeTitle: "׳׳¨׳—׳‘ ׳¢׳‘׳•׳“׳” ׳׳₪׳¨׳•׳™׳§׳˜׳™׳, ׳׳™׳©׳•׳¨׳™ ׳©׳˜׳— ׳•׳—׳•׳׳¨׳™ ׳‘׳ ׳™׳™׳”.",
    homeDescription: "׳”׳׳׳©׳§ ׳׳©׳ ׳” ׳©׳₪׳” ׳׳ ׳™׳”׳•׳ ׳׳×׳¨׳™׳, ׳׳™׳©׳•׳¨׳™ ׳‘׳™׳¦׳•׳¢, ׳™׳•׳׳ ׳™ ׳¢׳‘׳•׳“׳” ׳•׳—׳•׳׳¨׳™ ׳’׳׳.",
    templates: [
      { id: "SITE_LOG", label: "׳™׳•׳׳ ׳¢׳‘׳•׳“׳”", description: "׳“׳™׳•׳•׳— ׳™׳•׳׳™ ׳¢׳ ׳¦׳•׳•׳×, ׳—׳•׳׳¨׳™׳ ׳•׳”׳×׳§׳“׳׳•׳×.", kind: "REPORT" },
      { id: "MATERIAL_APPROVAL", label: "׳׳™׳©׳•׳¨ ׳—׳•׳׳¨/׳׳¡׳₪׳§׳”", description: "׳׳™׳©׳•׳¨ ׳§׳‘׳׳” ׳׳• ׳©׳™׳׳•׳© ׳‘׳—׳•׳׳¨׳™ ׳‘׳ ׳™׳™׳”.", kind: "APPROVAL" },
      { id: "WORK_COMPLETION", label: "׳׳™׳©׳•׳¨ ׳¡׳™׳•׳ ׳©׳׳‘", description: "׳׳™׳©׳•׳¨ ׳׳¡׳™׳¨׳” ׳׳• ׳¡׳™׳•׳ ׳©׳׳‘ ׳׳₪׳¨׳•׳™׳§׳˜.", kind: "APPROVAL" },
      { id: "INVOICE", label: "׳—׳©׳‘׳•׳ ׳™׳× ׳§׳‘׳׳", description: "׳—׳™׳•׳‘ ׳¨׳©׳׳™ ׳¢׳‘׳•׳¨ ׳¢׳‘׳•׳“׳•׳× ׳׳• ׳©׳׳‘׳™׳.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
  MEDICAL: {
    clientsLabel: "׳׳˜׳•׳₪׳׳™׳ ׳•׳×׳™׳§׳™׳ ׳§׳׳™׳ ׳™׳™׳",
    documentsLabel: "׳×׳™׳§׳™ ׳˜׳™׳₪׳•׳ ׳•׳׳¡׳׳›׳™׳ ׳¨׳₪׳•׳׳™׳™׳",
    recordsLabel: "׳˜׳₪׳¡׳™ ׳˜׳™׳₪׳•׳, ׳׳™׳©׳•׳¨׳™׳ ׳•׳¡׳™׳›׳•׳׳™׳",
    homeTitle: "׳׳¨׳›׳– ׳¢׳‘׳•׳“׳” ׳©׳׳“׳‘׳¨ ׳§׳׳™׳ ׳™׳§׳” ׳•׳׳ ׳¨׳§ CRM.",
    homeDescription: "׳›׳•׳×׳¨׳•׳×, ׳׳¡׳׳›׳™׳ ׳•׳₪׳¢׳ ׳•׳—׳™ AI ׳׳•׳×׳׳׳™׳ ׳׳׳˜׳•׳₪׳׳™׳, ׳˜׳™׳₪׳•׳׳™׳, ׳׳¨׳©׳׳™׳ ׳•׳׳™׳©׳•׳¨׳™ ׳˜׳™׳₪׳•׳.",
    templates: [
      { id: "CONSENT_FORM", label: "׳˜׳•׳₪׳¡ ׳”׳¡׳›׳׳”", description: "׳׳™׳©׳•׳¨ ׳—׳×׳•׳ ׳׳• ׳₪׳ ׳™׳׳™ ׳׳₪׳ ׳™ ׳˜׳™׳₪׳•׳.", kind: "APPROVAL" },
      { id: "TREATMENT_SUMMARY", label: "׳¡׳™׳›׳•׳ ׳˜׳™׳₪׳•׳", description: "׳“׳•׳— ׳׳”׳׳ ׳˜׳™׳₪׳•׳ ׳•׳”׳׳׳¦׳•׳× ׳׳”׳׳©׳.", kind: "REPORT" },
      { id: "REFERRAL_APPROVAL", label: "׳׳™׳©׳•׳¨ ׳”׳₪׳ ׳™׳”", description: "׳׳™׳©׳•׳¨ ׳׳• ׳×׳™׳¢׳•׳“ ׳׳”׳₪׳ ׳™׳” ׳—׳™׳¦׳•׳ ׳™׳×.", kind: "APPROVAL" },
      { id: "RECEIPT", label: "׳§׳‘׳׳” ׳¢׳ ׳˜׳™׳₪׳•׳", description: "׳׳™׳©׳•׳¨ ׳×׳©׳׳•׳ ׳¨׳©׳׳™ ׳׳׳˜׳•׳₪׳.", kind: "OFFICIAL", issuedDocumentType: "RECEIPT" },
    ],
  },
  RETAIL: {
    clientsLabel: "׳׳§׳•׳—׳•׳×, ׳¡׳₪׳§׳™׳ ׳•׳׳׳׳™",
    documentsLabel: "׳׳¡׳׳›׳™ ׳׳׳׳™ ׳•׳¡׳—׳¨",
    recordsLabel: "׳׳™׳©׳•׳¨׳™ ׳׳׳׳™ ׳•׳׳¡׳׳›׳™ ׳׳¡׳₪׳§׳”",
    homeTitle: "׳ ׳™׳”׳•׳ ׳׳¡׳—׳¨ ׳•׳׳׳׳™ ׳׳×׳•׳ ׳׳¡׳ ׳¢׳‘׳•׳“׳” ׳׳—׳“.",
    homeDescription: "׳”׳׳¢׳¨׳›׳× ׳׳×׳׳™׳׳” ׳׳× ׳”׳©׳₪׳” ׳׳”׳–׳׳ ׳•׳×, ׳׳¡׳₪׳§׳•׳×, ׳׳׳׳™ ׳•׳¡׳₪׳§׳™׳ ׳‘׳׳§׳•׳ ׳׳•׳ ׳—׳™׳ ׳›׳׳׳™׳™׳.",
    templates: [
      { id: "DELIVERY_CONFIRMATION", label: "׳׳™׳©׳•׳¨ ׳׳¡׳₪׳§׳”", description: "׳×׳™׳¢׳•׳“ ׳§׳‘׳׳” ׳׳• ׳׳¡׳™׳¨׳” ׳©׳ ׳׳׳׳™.", kind: "APPROVAL" },
      { id: "INVENTORY_REPORT", label: "׳“׳•׳— ׳₪׳¢׳¨׳™ ׳׳׳׳™", description: "׳¡׳™׳›׳•׳ ׳—׳¨׳™׳’׳•׳×, ׳—׳•׳¡׳¨׳™׳ ׳•׳¢׳“׳›׳•׳ ׳׳“׳₪׳™׳.", kind: "REPORT" },
      { id: "PURCHASE_ORDER", label: "׳”׳–׳׳ ׳× ׳¨׳›׳©", description: "׳׳¡׳׳ ׳₪׳ ׳™׳׳™ ׳׳• ׳—׳™׳¦׳•׳ ׳™ ׳׳”׳–׳׳ ׳” ׳׳¡׳₪׳§.", kind: "FORM" },
      { id: "INVOICE", label: "׳—׳©׳‘׳•׳ ׳™׳× ׳¨׳›׳©/׳׳›׳™׳¨׳”", description: "׳—׳™׳•׳‘ ׳¨׳©׳׳™ ׳׳•׳ ׳¡׳₪׳§ ׳׳• ׳׳§׳•׳—.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
  REAL_ESTATE: {
    clientsLabel: "׳§׳•׳ ׳™׳, ׳©׳•׳›׳¨׳™׳ ׳•׳ ׳›׳¡׳™׳",
    documentsLabel: "׳ ׳›׳¡׳™׳, ׳—׳•׳–׳™׳ ׳•׳׳¡׳׳›׳™׳",
    recordsLabel: "׳׳™׳©׳•׳¨׳™ ׳ ׳›׳¡ ׳•׳“׳•׳—׳•׳× ׳×׳™׳•׳•׳",
    homeTitle: "׳׳¨׳—׳‘ ׳¢׳‘׳•׳“׳” ׳©׳׳›׳•׳•׳ ׳׳ ׳›׳¡׳™׳, ׳¢׳¡׳§׳׳•׳× ׳•׳׳™׳©׳•׳¨׳™׳.",
    homeDescription: "׳”׳׳¢׳¨׳›׳× ׳׳—׳׳™׳₪׳” ׳©׳₪׳” ׳›׳׳׳™׳× ׳‘׳©׳₪׳” ׳©׳ ׳ ׳›׳¡׳™׳, ׳¢׳¡׳§׳׳•׳×, ׳©׳•׳›׳¨׳™׳ ׳•׳׳™׳©׳•׳¨׳™ ׳׳¡׳™׳¨׳”.",
    templates: [
      { id: "PROPERTY_SUMMARY", label: "׳¡׳™׳›׳•׳ ׳ ׳›׳¡", description: "׳¡׳™׳›׳•׳ ׳ ׳×׳•׳ ׳™ ׳ ׳›׳¡, ׳‘׳¢׳׳•׳× ׳•׳¡׳˜׳˜׳•׳¡.", kind: "REPORT" },
      { id: "TENANCY_APPROVAL", label: "׳׳™׳©׳•׳¨ ׳©׳›׳™׳¨׳•׳×", description: "׳׳™׳©׳•׳¨ ׳×׳”׳׳™׳ ׳©׳›׳™׳¨׳•׳×, ׳׳¡׳™׳¨׳” ׳׳• ׳—׳™׳“׳•׳©.", kind: "APPROVAL" },
      { id: "VIEWING_REPORT", label: "׳“׳•׳— ׳₪׳’׳™׳©׳” ׳‘׳ ׳›׳¡", description: "׳×׳™׳¢׳•׳“ ׳¡׳™׳•׳¨, ׳₪׳’׳™׳©׳” ׳׳• ׳¡׳˜׳˜׳•׳¡ ׳¢׳¡׳§׳”.", kind: "REPORT" },
      { id: "INVOICE", label: "׳—׳©׳‘׳•׳ ׳™׳× ׳×׳™׳•׳•׳/׳ ׳™׳”׳•׳", description: "׳—׳™׳•׳‘ ׳¨׳©׳׳™ ׳¢׳ ׳©׳™׳¨׳•׳×׳™ ׳×׳™׳•׳•׳ ׳׳• ׳ ׳™׳”׳•׳.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
};

