import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { env } from "@/lib/env";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";

export type ScreenType =
  | "invoice"
  | "blueprint"
  | "quote_boq"
  | "progress_bill"
  | "general"
  | "site_log"
  | "drive_auto";

export type ScreenDecodePolicy = {
  screenType: ScreenType;
  scanMode: ScanModeV5 | "SITE_LOG" | "QUOTE_BOQ" | "PROGRESS_BILL";
  primaryModel: string;
  fallbackModel?: string;
  thinkingLevel?: "low" | "medium" | "high";
  postActions: Array<"erp" | "crm" | "tasks" | "boq" | "work_diary" | "notebook">;
};

// המודל בפועל נקבע ע"י getModelChainForScanMode() — primaryModel הוא שדה תצוגה בלבד.
const SCAN_DISPLAY_FLASH = env.GEMINI_INVOICE_MODEL?.trim() ?? "gemini-3.5-flash";
const SCAN_DISPLAY_BLUEPRINT =
  env.GEMINI_BLUEPRINT_PRIMARY_MODEL?.trim() ?? "gemini-3.5-flash";

export const SCREEN_AI_POLICY: Record<ScreenType, ScreenDecodePolicy> = {
  invoice: {
    screenType: "invoice",
    scanMode: "INVOICE_FINANCIAL",
    primaryModel: SCAN_DISPLAY_FLASH,
    postActions: ["erp", "crm"],
  },
  blueprint: {
    screenType: "blueprint",
    scanMode: "DRAWING_BOQ",
    primaryModel: SCAN_DISPLAY_BLUEPRINT,
    fallbackModel: SCAN_DISPLAY_FLASH,
    thinkingLevel: "medium",
    postActions: ["tasks", "boq", "notebook"],
  },
  quote_boq: {
    screenType: "quote_boq",
    scanMode: "QUOTE_BOQ",
    primaryModel: env.GEMINI_QUOTE_MODEL?.trim() ?? SCAN_DISPLAY_FLASH,
    fallbackModel: SCAN_DISPLAY_FLASH,
    postActions: ["boq"],
  },
  progress_bill: {
    screenType: "progress_bill",
    scanMode: "PROGRESS_BILL",
    primaryModel: env.GEMINI_PROGRESS_BILL_MODEL?.trim() ?? SCAN_DISPLAY_FLASH,
    postActions: ["boq"],
  },
  general: {
    screenType: "general",
    scanMode: "GENERAL_DOCUMENT",
    primaryModel: env.GEMINI_GENERAL_MODEL?.trim() ?? SCAN_DISPLAY_FLASH,
    postActions: ["notebook", "erp"],
  },
  site_log: {
    screenType: "site_log",
    scanMode: "SITE_LOG",
    primaryModel: env.GEMINI_SITE_LOG_MODEL?.trim() ?? SCAN_DISPLAY_FLASH,
    postActions: ["work_diary", "boq", "notebook"],
  },
  drive_auto: {
    screenType: "drive_auto",
    scanMode: "GENERAL_DOCUMENT",
    primaryModel: env.GEMINI_GENERAL_MODEL?.trim() ?? SCAN_DISPLAY_FLASH,
    postActions: ["notebook", "erp"],
  },
};

export function inferScreenTypeFromFile(fileName: string, mime: string): ScreenType {
  const lower = fileName.toLowerCase();
  if (/חשבונית|invoice|קבלה|receipt/i.test(lower) || mime.includes("invoice")) return "invoice";
  if (/הצעת\s*מחיר|quote|כתב\s*כמויות|boq/i.test(lower)) return "quote_boq";
  if (/חשבון\s*\d|progress|חלקי/i.test(lower)) return "progress_bill";
  if (/יומן|site.?log|דוח\s*יום/i.test(lower)) return "site_log";
  if (/תוכנית|גרמושקה|blueprint|dwg|plan/i.test(lower) || mime.includes("pdf")) {
    if (/תוכנית|גרמושקה|blueprint|plan/i.test(lower)) return "blueprint";
  }
  return "general";
}

/** לענף עסקי — ללא סיווג אוטומטי ל-BOQ / יומן שטח */
export function inferScreenTypeFromFileForIndustry(
  fileName: string,
  mime: string,
  industryRaw?: string | null,
): ScreenType {
  if (!isCompanyMgmtIndustry(industryRaw)) {
    return inferScreenTypeFromFile(fileName, mime);
  }
  const lower = fileName.toLowerCase();
  if (/חשבונית|invoice|קבלה|receipt/i.test(lower) || mime.includes("invoice")) return "invoice";
  if (/חוזה|contract|הצעה|proposal|דוח|report/i.test(lower)) return "general";
  return "general";
}

export function resolvePolicy(screenType: ScreenType): ScreenDecodePolicy {
  return SCREEN_AI_POLICY[screenType] ?? SCREEN_AI_POLICY.general;
}

export function resolvePolicyForIndustry(
  screenType: ScreenType,
  industryRaw?: string | null,
): ScreenDecodePolicy {
  if (!isCompanyMgmtIndustry(industryRaw)) return resolvePolicy(screenType);
  const companyPolicy: Partial<Record<ScreenType, ScreenDecodePolicy>> = {
    blueprint: {
      screenType: "general",
      scanMode: "GENERAL_DOCUMENT",
      primaryModel: SCREEN_AI_POLICY.general.primaryModel,
      postActions: ["notebook", "erp", "crm"],
    },
    quote_boq: {
      screenType: "general",
      scanMode: "GENERAL_DOCUMENT",
      primaryModel: SCREEN_AI_POLICY.general.primaryModel,
      postActions: ["notebook", "erp"],
    },
    progress_bill: {
      screenType: "general",
      scanMode: "INVOICE_FINANCIAL",
      primaryModel: SCREEN_AI_POLICY.invoice.primaryModel,
      postActions: ["erp", "crm"],
    },
    site_log: {
      screenType: "general",
      scanMode: "GENERAL_DOCUMENT",
      primaryModel: SCREEN_AI_POLICY.general.primaryModel,
      postActions: ["notebook", "tasks"],
    },
  };
  const mapped = companyPolicy[screenType];
  if (mapped) return mapped;
  const base = resolvePolicy(screenType);
  if (base.postActions.includes("boq") || base.postActions.includes("work_diary")) {
    return {
      ...base,
      postActions: base.postActions.filter((a) => a !== "boq" && a !== "work_diary"),
    };
  }
  return base;
}
