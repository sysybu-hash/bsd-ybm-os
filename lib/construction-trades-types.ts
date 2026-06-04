import type { IndustryConfig } from "@/lib/professions/config";

export const CONSTRUCTION_TRADE_IDS = [
  "GENERAL_CONTRACTOR",
  "ELECTRICAL",
  "PLUMBING",
  "HVAC",
  "PAINTING",
  "FLOORING",
  "ALUMINUM",
  "FINISHING",
  "LANDSCAPING",
  "SUBCONTRACTOR_OTHER",
] as const;

export type ConstructionTradeId = (typeof CONSTRUCTION_TRADE_IDS)[number];

export type TradeIssueTemplate = {
  id: string;
  label: string;
  description: string;
  kind: "OFFICIAL" | "APPROVAL" | "FORM" | "REPORT";
  issuedDocumentType?: "INVOICE" | "RECEIPT" | "INVOICE_RECEIPT" | "CREDIT_NOTE";
};

export type ConstructionTradePatch = {
  scanner: Partial<IndustryConfig["scanner"]> & {
    analysisTypes?: IndustryConfig["scanner"]["analysisTypes"];
    resultColumns?: IndustryConfig["scanner"]["resultColumns"];
  };
  aiInstructionsSuffix?: string;
  vocabulary?: Partial<IndustryConfig["vocabulary"]>;
  profile?: {
    clientsLabel: string;
    documentsLabel: string;
    recordsLabel: string;
    homeTitle: string;
    homeDescription: string;
    templates: TradeIssueTemplate[];
  };
};

export type ConstructionTradeProfileOverlay = NonNullable<ConstructionTradePatch["profile"]>;
