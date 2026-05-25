import {
  buildDocumentCreatorLiveData,
  CONSTRUCTION_DOCUMENT_CATALOG,
  type BoqLinePrefill,
  type ProjectDocumentCatalogEntry,
} from "@/lib/project-document-catalog";
import type { LineItemV5, ScanExtractionV5 } from "@/lib/scan-schema-v5";

export type FieldCopilotHandoffTarget = "QUOTE" | "BOQ" | "ORDER_AGREEMENT";

function findCatalogEntry(target: FieldCopilotHandoffTarget): ProjectDocumentCatalogEntry | undefined {
  if (target === "BOQ") {
    return CONSTRUCTION_DOCUMENT_CATALOG.find((e) => e.templateId === "BOQ_SHEET");
  }
  if (target === "ORDER_AGREEMENT") {
    return CONSTRUCTION_DOCUMENT_CATALOG.find((e) => e.templateId === "ORDER_AGREEMENT");
  }
  return CONSTRUCTION_DOCUMENT_CATALOG.find((e) => e.docType === "QUOTE");
}

export function extractionToBoqLines(extraction: ScanExtractionV5): BoqLinePrefill[] {
  const fromLineItems = extraction.lineItems.map((row, i) => ({
    id: `fc-${i}`,
    description: row.description,
    quantity: row.quantity ?? 1,
    unitPrice: row.unitPrice ?? 0,
    lineTotal: row.lineTotal,
    unit: undefined as string | undefined,
  }));

  if (fromLineItems.length > 0) return fromLineItems;

  return extraction.billOfQuantities.map((row, i) => ({
    id: `fc-boq-${i}`,
    description: row.description,
    quantity: row.quantity ?? 1,
    unitPrice: 0,
    lineTotal: undefined as number | undefined,
    unit: row.unit ?? undefined,
  }));
}

export function buildFieldCopilotDocCreatorLiveData(input: {
  target: FieldCopilotHandoffTarget;
  extraction: ScanExtractionV5;
  projectId?: string | null;
  projectName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  domainLabel?: string | null;
}): Record<string, unknown> {
  const boqLines = extractionToBoqLines(input.extraction);

  if (input.target === "BOQ") {
    const entry = findCatalogEntry("BOQ");
    if (entry) {
      return buildDocumentCreatorLiveData({
        entry,
        projectId: input.projectId ?? "",
        projectName: input.projectName ?? "פרויקט",
        contactId: input.contactId ?? undefined,
        contactName: input.contactName ?? undefined,
        domainLabel: input.domainLabel ?? undefined,
        boqLines,
      });
    }
    return { action: "open_boq", projectId: input.projectId, projectName: input.projectName };
  }

  const templateId = input.target === "ORDER_AGREEMENT" ? "ORDER_AGREEMENT" : "QUOTE";
  const entry = findCatalogEntry(input.target);
  if (!entry) {
    return {
      automation: "invoice_draft",
      docType: input.target === "ORDER_AGREEMENT" ? "QUOTE" : "QUOTE",
      projectId: input.projectId,
      projectName: input.projectName,
      contactId: input.contactId,
      contactName: input.contactName,
      items: boqLines.slice(0, 40).map((line) => ({
        description: line.description,
        quantity: line.quantity ?? 1,
        price: line.unitPrice ?? 0,
      })),
    };
  }

  return buildDocumentCreatorLiveData({
    entry,
    projectId: input.projectId ?? "",
    projectName: input.projectName ?? "פרויקט",
    contactId: input.contactId ?? undefined,
    contactName: input.contactName ?? undefined,
    domainLabel: input.domainLabel ?? undefined,
    boqLines,
  });
}

export function lineItemsFromExtraction(extraction: ScanExtractionV5): LineItemV5[] {
  return extraction.lineItems.length > 0
    ? extraction.lineItems
    : extraction.billOfQuantities.map((row) => ({
        description: row.description,
        quantity: row.quantity ?? 1,
        unitPrice: 0,
      }));
}
