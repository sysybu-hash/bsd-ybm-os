import type { DocType } from "@prisma/client";

export interface DocItem {
  id: string;
  description: string;
  quantity: number;
  price: number;
}

export type IssuedDocEntry = {
  id: string;
  type: DocType;
  number: number;
  clientName: string;
  total: number;
  date: string;
};

export type OrgSettings = {
  name: string;
  taxId: string;
  email: string;
  vatRatePercent: number;
  companyType?: string;
  isReportable?: boolean;
};

export type GeneratedDocState = {
  id?: string;
  token: string;
  documentNumber: number;
  signUrl: string;
  paymentLink?: string;
  clientName: string;
  items: DocItem[];
  amount: number;
};

export type DocumentCreatorWidgetProps = {
  liveData?: Record<string, unknown> | null;
  embeddedInHub?: boolean;
};
