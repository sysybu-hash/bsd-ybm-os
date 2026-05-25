import {
  buildFieldCopilotDocCreatorLiveData,
  extractionToBoqLines,
} from "@/lib/field-copilot/handoff";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";

const sampleExtraction: ScanExtractionV5 = {
  schemaVersion: 5,
  documentMetadata: {
    project: "בניין א",
    client: "לקוח",
    documentDate: null,
    drawingRefs: null,
    discipline: null,
    sheetIndex: null,
    sourceFileName: "field-capture",
    scanMode: "QUOTE_BOQ",
  },
  billOfQuantities: [
    { itemRef: null, description: "טיח", material: null, dimensions: null, mepPoints: null, quantity: 20, unit: "מ\"ר", notes: null },
  ],
  lineItems: [{ description: "ריצוף", quantity: 12, unitPrice: 0, lineTotal: 0 }],
  vendor: "לא צוין",
  total: 0,
  date: null,
  docType: "QUOTE",
  summary: "שיפוץ",
  priceAlertPending: true,
};

describe("field-copilot handoff", () => {
  it("prefers lineItems for BOQ lines", () => {
    const lines = extractionToBoqLines(sampleExtraction);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.description).toBe("ריצוף");
    expect(lines[0]!.unitPrice).toBe(0);
  });

  it("builds quote liveData for docCreator", () => {
    const live = buildFieldCopilotDocCreatorLiveData({
      target: "QUOTE",
      extraction: sampleExtraction,
      projectId: "proj-1",
      projectName: "בניין א",
      contactId: "c-1",
      contactName: "לקוח",
    });

    expect(live.automation).toBe("invoice_draft");
    expect(live.projectId).toBe("proj-1");
    expect(Array.isArray(live.items)).toBe(true);
  });

  it("builds BOQ navigation payload", () => {
    const live = buildFieldCopilotDocCreatorLiveData({
      target: "BOQ",
      extraction: sampleExtraction,
      projectId: "proj-1",
      projectName: "בניין א",
    });

    expect(live.action === "open_boq" || live.automation === "invoice_draft").toBe(true);
    expect(live.projectId).toBe("proj-1");
  });
});
