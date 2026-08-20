import type { FinanceForecast } from "@/lib/finance-forecast";

/** טיפוסי snapshot של Commercial Hub — פוצל מ-load-commercial-hub.ts */
export type CommercialClientSnapshot = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  value: number | null;
  createdAt: string;
  project: { id: string; name: string } | null;
  invoiceCount: number;
  totalBilled: number;
  totalPending: number;
};

export type CommercialProjectSnapshot = {
  id: string;
  name: string;
  isActive: boolean;
  activeFrom: string | null;
  activeTo: string | null;
  contactCount: number;
  totalValue: number;
  activeDeals: number;
  pendingCollection: number;
  billedTotal: number;
};

export type CommercialIssuedDocumentSnapshot = {
  id: string;
  type: string;
  status: string;
  clientName: string;
  total: number;
  date: string;
  contactId: string | null;
  projectName: string | null;
  projectId: string | null;
  contactEmail: string | null;
};

export type CommercialDocumentDraftSnapshot = {
  id: string;
  fileName: string;
  createdAt: string;
  projectLabel: string | null;
  clientLabel: string | null;
};

export type CommercialHubSnapshot = {
  forecast: FinanceForecast;
  contacts: CommercialClientSnapshot[];
  projects: CommercialProjectSnapshot[];
  recentIssued: CommercialIssuedDocumentSnapshot[];
  /** ׳׳¡׳׳›׳™ ׳¡׳¨׳™׳§׳”/ERP ׳©׳¢׳“׳™׳™׳ ׳׳ ׳”׳•׳©׳׳׳• (׳׳¢׳•׳׳× ׳—׳©׳‘׳•׳ ׳™׳•׳× ׳©׳”׳•׳ ׳₪׳§׳•) */
  documentDrafts: CommercialDocumentDraftSnapshot[];
  /** ׳׳—׳•׳– ׳©׳™׳ ׳•׳™ ׳‘׳¡׳›׳•׳ ׳׳¡׳׳›׳™׳ ׳׳•׳ ׳₪׳§׳™׳ (׳׳₪׳™ ׳©׳“׳” date) ׳‘׳™׳ ׳”׳—׳•׳“׳© ׳”׳ ׳•׳›׳—׳™ ׳׳§׳•׳“׳ */
  issuedMonthOverMonthPct: number;
  totals: {
    clientsCount: number;
    activeProjects: number;
    pipelineValue: number;
    pendingCollection: number;
    /** ׳›׳ ׳׳¡׳׳ ׳”׳•׳ ׳₪׳§ ׳‘-PENDING (׳›׳•׳׳ ׳§׳‘׳׳•׳×/׳–׳™׳›׳•׳™׳™׳) ג€” ׳©׳™׳׳•׳¨׳™ ׳×׳׳™׳׳•׳× */
    pendingIssuedTotal: number;
    pendingIssuedCount: number;
    /** ׳—׳©׳‘׳•׳ ׳™׳× ׳׳¡ / ׳׳¡-׳§׳‘׳׳” ׳‘׳׳‘׳“, PENDING ג€” ׳’׳‘׳™׳™׳” ׳׳׳™׳×׳™׳× */
    billingPendingTotal: number;
    billingPendingCount: number;
    /** ׳׳¡׳׳›׳™ ׳¡׳¨׳™׳§׳”/ERP ׳©׳׳׳×׳™׳ ׳™׳ ׳׳˜׳™׳₪׳•׳ ׳׳₪׳ ׳™ ׳”׳₪׳§׳” ׳׳׳§׳•׳— */
    documentDraftsCount: number;
    paidIssuedTotal: number;
    paidIssuedCount: number;
  };
};


