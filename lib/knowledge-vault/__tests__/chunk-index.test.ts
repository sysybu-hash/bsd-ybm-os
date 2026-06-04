import {
  chunkPlainText,
  summaryToSearchText,
} from "@/lib/knowledge-vault/chunk-index";

describe("knowledge-vault chunk-index", () => {
  it("chunkPlainText splits long normalized text", () => {
    const text = "א ".repeat(400).trim();
    const chunks = chunkPlainText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toContain("א");
  });

  it("summaryToSearchText combines file name and parsed fields", () => {
    const out = summaryToSearchText(
      {
        textPreview: "תוכן מסמך",
        detectedDocType: "INVOICE",
        detectedClientName: "לקוח",
      },
      "scan.pdf",
    );
    expect(out).toContain("scan.pdf");
    expect(out).toContain("תוכן מסמך");
    expect(out).toContain("INVOICE");
  });
});
