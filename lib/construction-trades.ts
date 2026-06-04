import {
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


export function normalizeConstructionTrade(raw?: string | null): ConstructionTradeId {
  const u = String(raw ?? "").trim().toUpperCase();
  return CONSTRUCTION_TRADE_IDS.includes(u as ConstructionTradeId)
    ? (u as ConstructionTradeId)
    : "GENERAL_CONTRACTOR";
}

export function constructionTradeLabelHe(id: ConstructionTradeId): string {
  return LABELS_HE[id] ?? LABELS_HE.GENERAL_CONTRACTOR;
}

export function listConstructionTradesForSelect(): Array<{ id: ConstructionTradeId; label: string }> {
  return CONSTRUCTION_TRADE_IDS.map((id) => ({ id, label: LABELS_HE[id] }));
}

/** מיזוג מלא של IndustryConfig לסורק — לפי ענף, trade, ואופציונלית הודעות UI (תרגום EN/RU) */
export function getMergedIndustryConfig(
  industryRaw: string | undefined | null,
  constructionTradeRaw?: string | null,
  localeMessages?: MessageTree | null,
): IndustryConfig {
  const key = normalizeIndustryType(industryRaw) as IndustryType;
  const base = INDUSTRY_CONFIGS[key] ?? INDUSTRY_CONFIGS.GENERAL;
  if (key === "COMPANY_MGMT") {
    return mergeCompanyMgmtIndustryConfig(constructionTradeRaw, localeMessages);
  }
  if (key !== "CONSTRUCTION") {
    return base;
  }
  const trade = normalizeConstructionTrade(constructionTradeRaw);
  const patch = TRADE_PATCHES[trade];
  if (!patch) {
    return base;
  }
  let vocabulary = {
    ...base.vocabulary,
    ...(patch.vocabulary ?? {}),
  };
  vocabulary = mergeTradeVocabularyFromMessages(localeMessages ?? undefined, trade, vocabulary);

  let scanner = {
    ...base.scanner,
    ...patch.scanner,
    analysisTypes: patch.scanner.analysisTypes ?? base.scanner.analysisTypes,
    resultColumns: patch.scanner.resultColumns ?? base.scanner.resultColumns,
  };
  scanner = mergeScannerShellFromMessages(localeMessages ?? undefined, trade, scanner);
  scanner = {
    ...scanner,
    analysisTypes: mergeAnalysisTypesFromMessages(localeMessages ?? undefined, trade, scanner.analysisTypes),
    resultColumns: mergeResultColumnsFromMessages(
      localeMessages ?? undefined,
      trade,
      scanner.resultColumns,
    ),
  };

  return {
    ...base,
    vocabulary,
    scanner,
    aiInstructions: patch.aiInstructionsSuffix
      ? `${base.aiInstructions} ${patch.aiInstructionsSuffix}`
      : base.aiInstructions,
  };
}

/** תוויות מסך הבית, מסמכים ותבניות הנפקה — רק כשמקצוע הבנייה אינו «קבלן ראשי» כללי */
export function getConstructionTradeProfileOverlay(
  constructionTradeRaw?: string | null,
): ConstructionTradeProfileOverlay | null {
  const trade = normalizeConstructionTrade(constructionTradeRaw);
  if (trade === "GENERAL_CONTRACTOR") return null;
  const patch = TRADE_PATCHES[trade];
  return patch?.profile ?? null;
}

