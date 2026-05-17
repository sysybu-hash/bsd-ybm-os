import type { DriveDecodeStatus } from "@prisma/client";

export type DriveSaveTarget = "ERP" | "CRM" | "REVIEW" | "SKIP";

export type DriveDecodeRouting = {
  targetModule: DriveSaveTarget;
  analysisType: string;
  needsReview: boolean;
  reason?: string;
};

function normDocType(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

/** מיפוי סוג מסמך מ-AI ליעד שמירה */
export function routeDriveDecode(aiData: Record<string, unknown>): DriveDecodeRouting {
  const docType = normDocType(aiData.docType ?? aiData.documentType ?? aiData.type);
  const meta = aiData.metadata;
  const metaObj =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : null;
  const metaType = normDocType(metaObj?.docType ?? metaObj?.type);

  const combined = docType || metaType;

  if (!combined || combined === "UNKNOWN" || combined === "OTHER") {
    return {
      targetModule: "REVIEW",
      analysisType: "INVOICE",
      needsReview: true,
      reason: "סוג מסמך לא זוהה",
    };
  }

  if (
    combined.includes("QUOTE") ||
    combined.includes("הצע") ||
    combined === "PROPOSAL"
  ) {
    return {
      targetModule: "REVIEW",
      analysisType: "QUOTE",
      needsReview: true,
      reason: "הצעת מחיר — אישור לפני שמירה",
    };
  }

  if (
    combined.includes("EXPENSE") ||
    combined.includes("SUPPLIER") ||
    combined.includes("הוצא")
  ) {
    return {
      targetModule: "ERP",
      analysisType: "EXPENSE",
      needsReview: false,
    };
  }

  if (combined.includes("RECEIPT") || combined.includes("קבל")) {
    return {
      targetModule: "ERP",
      analysisType: "RECEIPT",
      needsReview: false,
    };
  }

  if (
    combined.includes("INVOICE") ||
    combined.includes("חשבונ") ||
    combined.includes("TAX")
  ) {
    return {
      targetModule: "ERP",
      analysisType: "INVOICE",
      needsReview: false,
    };
  }

  if (combined.includes("CRM") || combined.includes("CONTACT") || combined.includes("לקוח")) {
    return {
      targetModule: "CRM",
      analysisType: "INVOICE",
      needsReview: false,
    };
  }

  return {
    targetModule: "ERP",
    analysisType: "INVOICE",
    needsReview: false,
  };
}

export function extractClientNameFromAi(aiData: Record<string, unknown>): string {
  const meta = aiData.metadata;
  const metaObj =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : null;
  const clientFromMeta = metaObj?.client;
  if (typeof clientFromMeta === "string" && clientFromMeta.trim()) {
    return clientFromMeta.trim();
  }
  if (typeof aiData.vendor === "string" && aiData.vendor.trim()) {
    return aiData.vendor.trim();
  }
  if (typeof aiData.clientName === "string" && aiData.clientName.trim()) {
    return aiData.clientName.trim();
  }
  return "";
}

export function decodeStatusLabel(status: DriveDecodeStatus | null | undefined): string {
  switch (status) {
    case "PENDING":
      return "ממתין";
    case "PROCESSING":
      return "מפענח";
    case "COMPLETED":
      return "נשמר";
    case "FAILED":
      return "שגיאה";
    case "NEEDS_REVIEW":
      return "לאישור";
    default:
      return "—";
  }
}
