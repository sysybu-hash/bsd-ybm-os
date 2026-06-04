import fs from "node:fs";

const ct = fs.readFileSync("lib/construction-trades.ts", "utf8").split(/\r?\n/);
const tail = ct.slice(610).join("\n");

const typesFile = `import type { IndustryConfig } from "@/lib/professions/config";

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
`;

const patchesBody = ct.slice(70, 610).join("\n").replace("const TRADE_PATCHES", "export const TRADE_PATCHES");
const patchesFile = `import type { ConstructionTradeId, ConstructionTradePatch } from "@/lib/construction-trades-types";

${patchesBody}
`;

const mainFile = `import {
  mergeAnalysisTypesFromMessages,
  mergeResultColumnsFromMessages,
  mergeScannerShellFromMessages,
  mergeTradeVocabularyFromMessages,
} from "@/lib/construction-trades-i18n";
import type { MessageTree } from "@/lib/i18n/keys";
import { mergeCompanyMgmtIndustryConfig } from "@/lib/business-lines";
import {
  INDUSTRY_CONFIGS,
  normalizeIndustryType,
  type IndustryConfig,
  type IndustryType,
} from "@/lib/professions/config";
import {
  CONSTRUCTION_TRADE_IDS,
  type ConstructionTradeId,
  type ConstructionTradeProfileOverlay,
} from "@/lib/construction-trades-types";
import { TRADE_PATCHES } from "@/lib/construction-trades-patches";

export {
  CONSTRUCTION_TRADE_IDS,
  type ConstructionTradeId,
  type TradeIssueTemplate,
  type ConstructionTradeProfileOverlay,
} from "@/lib/construction-trades-types";

const LABELS_HE: Record<ConstructionTradeId, string> = {
  GENERAL_CONTRACTOR: "קבלן ראשי / ליווי פרויקט",
  ELECTRICAL: "חשמלאי / עבודות חשמל",
  PLUMBING: "אינסטלציה ותברואה",
  HVAC: "מיזוג אוויר",
  PAINTING: "צבע, טיח ושליכט",
  FLOORING: "ריצוף, אבן וקרמיקה",
  ALUMINUM: "אלומיניום וזכוכית",
  FINISHING: "גמר פנים (דלתות, מטבח…)",
  LANDSCAPING: "גינון קשיח / חוץ",
  SUBCONTRACTOR_OTHER: "קבלן משנה / אחר",
};

${tail}
`;

fs.writeFileSync("lib/construction-trades-types.ts", typesFile);
fs.writeFileSync("lib/construction-trades-patches.ts", patchesFile);
fs.writeFileSync("lib/construction-trades.ts", mainFile);
console.log("split construction-trades ok");
