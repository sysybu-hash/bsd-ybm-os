import {
  classifyScanDocumentHeuristic,
  isExplicitClientScanMode,
  shouldAutoClassifyDocumentType,
} from "@/lib/scan-classify";

describe("scan-classify", () => {
  it("isExplicitClientScanMode recognizes project modes", () => {
    expect(isExplicitClientScanMode("QUOTE_BOQ")).toBe(true);
    expect(isExplicitClientScanMode("SITE_LOG")).toBe(true);
    expect(isExplicitClientScanMode("GENERAL_DOCUMENT")).toBe(false);
  });

  it("classifies site log from filename", () => {
    const r = classifyScanDocumentHeuristic({
      fileName: "יומן-עבודה-מאי.pdf",
      mimeType: "application/pdf",
    });
    expect(r.scanMode).toBe("SITE_LOG");
  });

  it("classifies quote BOQ", () => {
    const r = classifyScanDocumentHeuristic({
      fileName: "הצעת מחיר כתב כמויות.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(r.scanMode).toBe("QUOTE_BOQ");
  });

  it("classifies progress bill", () => {
    const r = classifyScanDocumentHeuristic({
      fileName: "חשבון-3-התקדמות.pdf",
      mimeType: "application/pdf",
    });
    expect(r.scanMode).toBe("PROGRESS_BILL");
  });

  it("clamps site log to general document for company mgmt", () => {
    const r = classifyScanDocumentHeuristic({
      fileName: "יומן-עבודה-מאי.pdf",
      mimeType: "application/pdf",
      industry: "COMPANY_MGMT",
    });
    expect(r.scanMode).toBe("GENERAL_DOCUMENT");
  });

  it("shouldAutoClassifyDocumentType when doc type auto detect flag", () => {
    expect(
      shouldAutoClassifyDocumentType({
        scanMode: "GENERAL_DOCUMENT",
        engineRunMode: "SINGLE_GEMINI",
        docTypeAutoDetect: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoClassifyDocumentType({
        scanMode: "INVOICE_FINANCIAL",
        engineRunMode: "AUTO",
        docTypeAutoDetect: false,
      }),
    ).toBe(false);
  });
});
