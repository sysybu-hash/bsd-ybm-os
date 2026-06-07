import {
  parseScanMode,
  parseTriEngineFormData,
  parseTriEngineRunMode,
  triEngineCreditKindFor,
  validateTriEngineRequest,
} from "@/lib/tri-engine-parse";

describe("parseScanMode", () => {
  it("returns known modes", () => {
    expect(parseScanMode("INVOICE_FINANCIAL")).toBe("INVOICE_FINANCIAL");
    expect(parseScanMode("DRAWING_BOQ")).toBe("DRAWING_BOQ");
    expect(parseScanMode("SITE_LOG")).toBe("SITE_LOG");
  });

  it("defaults to GENERAL_DOCUMENT", () => {
    expect(parseScanMode(null)).toBe("GENERAL_DOCUMENT");
    expect(parseScanMode("unknown")).toBe("GENERAL_DOCUMENT");
  });
});

describe("parseTriEngineRunMode", () => {
  it("returns known run modes", () => {
    expect(parseTriEngineRunMode("SINGLE_GEMINI")).toBe("SINGLE_GEMINI");
    expect(parseTriEngineRunMode("multi_parallel")).toBe("MULTI_PARALLEL");
  });

  it("defaults to AUTO", () => {
    expect(parseTriEngineRunMode(null)).toBe("AUTO");
  });
});

describe("triEngineCreditKindFor", () => {
  it("marks invoice sequential as premium", () => {
    expect(triEngineCreditKindFor("INVOICE_FINANCIAL", "MULTI_SEQUENTIAL")).toBe("premium");
  });

  it("marks gemini-only as cheap", () => {
    expect(triEngineCreditKindFor("GENERAL_DOCUMENT", "SINGLE_GEMINI")).toBe("cheap");
  });
});

describe("parseTriEngineFormData", () => {
  it("returns null without file", () => {
    const fd = new FormData();
    expect(parseTriEngineFormData(fd)).toBeNull();
  });

  it("parses file and scan mode", () => {
    const fd = new FormData();
    fd.set("file", new File(["x"], "doc.pdf", { type: "application/pdf" }));
    fd.set("scanMode", "INVOICE_FINANCIAL");
    fd.set("persist", "true");
    const parsed = parseTriEngineFormData(fd);
    expect(parsed?.scanMode).toBe("INVOICE_FINANCIAL");
    expect(parsed?.persist).toBe(true);
    expect(parsed?.file.name).toBe("doc.pdf");
  });
});

describe("validateTriEngineRequest", () => {
  it("rejects empty file", () => {
    const file = new File([], "empty.pdf", { type: "application/pdf" });
    const result = validateTriEngineRequest({
      file,
      scanMode: "GENERAL_DOCUMENT",
      persist: false,
      projectLabel: null,
      clientLabel: null,
      userInstruction: null,
      engineRunMode: "AUTO",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "הקובץ ריק.", code: "empty_file" });
  });
});
