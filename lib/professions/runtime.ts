import { getIndustryConfig, type IndustryType } from "@/lib/professions/config";
import type { MessageTree } from "@/lib/i18n/keys";
import {
  mergeConstructionTradeLabel,
  mergeTradeProfileFromMessages,
} from "@/lib/construction-trades-i18n";
import {
  businessLineLabelHe,
  getBusinessLineProfileOverlay,
  normalizeBusinessLine,
  type BusinessLineId,
} from "@/lib/business-lines";
import {
  constructionTradeLabelHe,
  getConstructionTradeProfileOverlay,
  getMergedIndustryConfig,
  normalizeConstructionTrade,
  type ConstructionTradeId,
} from "@/lib/construction-trades";

import {
  INDUSTRY_PROFILES,
  type IndustryProfileBase,
} from "@/lib/professions/industry-profiles";

export type {
  IndustryProfileBase,
  OfficialIssuedDocumentType,
  ProfessionalDocumentTemplate,
  ProfessionalTemplateKind,
} from "@/lib/professions/industry-profiles";


export type IndustryProfile = IndustryProfileBase & {
  id: IndustryType;
  industryLabel: string;
  vocabulary: {
    client: string;
    project: string;
    document: string;
  };
  analysisTypes: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  /** ׳׳–׳”׳” ׳”׳×׳׳—׳•׳× ׳‘׳¢׳ ׳£ ׳”׳‘׳ ׳™׳™׳” ג€” ׳›׳©׳׳ ׳¨׳׳•׳•׳ ׳˜׳™ undefined */
  constructionTradeId?: ConstructionTradeId;
  constructionTradeLabel?: string;
  businessLineId?: BusinessLineId;
  businessLineLabel?: string;
};

type IndustryOverrides = {
  customLabels?: Partial<{
    clients: string;
    documents: string;
    records: string;
    client: string;
    project: string;
    document: string;
  }>;
};


function readOverrides(raw: unknown): IndustryOverrides {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const value = raw as Record<string, unknown>;
  const customLabelsRaw = value.customLabels;
  if (typeof customLabelsRaw !== "object" || customLabelsRaw === null || Array.isArray(customLabelsRaw)) {
    return {};
  }
  return {
    customLabels: customLabelsRaw as IndustryOverrides["customLabels"],
  };
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function pickMessageString(messages: MessageTree | undefined, key: string): string | undefined {
  if (!messages) return undefined;
  const parts = key.split(".");
  let cur: unknown = messages as unknown;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" && cur.trim() ? cur.trim() : undefined;
}

export function getIndustryProfile(
  industryId?: string,
  rawConfig?: unknown,
  constructionTrade?: string | null,
  localeMessages?: MessageTree | null,
): IndustryProfile {
  const config = getIndustryConfig(industryId);
  const merged = getMergedIndustryConfig(industryId, constructionTrade, localeMessages ?? undefined);
  const profile = INDUSTRY_PROFILES[config.id];
  const overrides = readOverrides(rawConfig);
  const customLabels = overrides.customLabels ?? {};
  const tradeId = normalizeConstructionTrade(constructionTrade);
  const tradeLabelHe = constructionTradeLabelHe(tradeId);
  const tradeLabel = mergeConstructionTradeLabel(localeMessages ?? undefined, tradeId, tradeLabelHe);
  const lineId = normalizeBusinessLine(constructionTrade);
  const lineLabelHe = businessLineLabelHe(lineId);
  const lineLabel = pickMessageString(localeMessages ?? undefined, `businessLineLabels.${lineId}`) ?? lineLabelHe;

  let tradeProfile =
    config.id === "CONSTRUCTION" ? getConstructionTradeProfileOverlay(constructionTrade) : null;
  if (localeMessages && tradeProfile) {
    tradeProfile = mergeTradeProfileFromMessages(localeMessages, tradeId, tradeProfile);
  }

  let businessProfile =
    config.id === "COMPANY_MGMT" ? getBusinessLineProfileOverlay(constructionTrade) : null;

  const baseIndustryLabel = pickMessageString(localeMessages ?? undefined, `professions.${config.id}.label`) ?? config.label;
  const industryLabel =
    config.id === "CONSTRUCTION"
      ? `${baseIndustryLabel} ֲ· ${tradeLabel}`
      : config.id === "COMPANY_MGMT"
        ? `${baseIndustryLabel} ֲ· ${lineLabel}`
        : baseIndustryLabel;

  const clientsBase =
    tradeProfile?.clientsLabel ?? businessProfile?.clientsLabel ?? profile.clientsLabel;
  const documentsBase =
    tradeProfile?.documentsLabel ?? businessProfile?.documentsLabel ?? profile.documentsLabel;
  const recordsBase =
    tradeProfile?.recordsLabel ?? businessProfile?.recordsLabel ?? profile.recordsLabel;
  const homeTitleBase = tradeProfile?.homeTitle ?? businessProfile?.homeTitle ?? profile.homeTitle;
  const homeDescriptionBase =
    tradeProfile?.homeDescription ?? businessProfile?.homeDescription ?? profile.homeDescription;
  const templatesBase = tradeProfile?.templates ?? businessProfile?.templates ?? profile.templates;

  return {
    id: config.id,
    industryLabel,
    clientsLabel: readString(customLabels.clients, clientsBase),
    documentsLabel: readString(customLabels.documents, documentsBase),
    financeNavLabel: profile.financeNavLabel,
    recordsLabel: readString(customLabels.records, recordsBase),
    homeTitle: homeTitleBase,
    homeDescription: homeDescriptionBase,
    vocabulary: {
      client: readString(customLabels.client, merged.vocabulary.client),
      project: readString(customLabels.project, merged.vocabulary.project),
      document: readString(customLabels.document, merged.vocabulary.document),
    },
    analysisTypes: merged.scanner.analysisTypes,
    templates: templatesBase as IndustryProfileBase["templates"],
    constructionTradeId: config.id === "CONSTRUCTION" ? tradeId : undefined,
    constructionTradeLabel: config.id === "CONSTRUCTION" ? tradeLabel : undefined,
    businessLineId: config.id === "COMPANY_MGMT" ? lineId : undefined,
    businessLineLabel: config.id === "COMPANY_MGMT" ? lineLabel : undefined,
  };
}

