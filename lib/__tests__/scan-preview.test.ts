import { canBrowserPreviewMime, scanPreviewKind } from "@/lib/scan-preview";

describe("scan-preview", () => {
  it("canBrowserPreviewMime accepts images and pdf", () => {
    expect(canBrowserPreviewMime("image/png")).toBe(true);
    expect(canBrowserPreviewMime("application/pdf")).toBe(true);
    expect(canBrowserPreviewMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
      false,
    );
  });

  it("scanPreviewKind classifies mime", () => {
    expect(scanPreviewKind("image/jpeg")).toBe("image");
    expect(scanPreviewKind("application/pdf")).toBe("pdf");
    expect(scanPreviewKind("text/plain")).toBe("text");
  });
});
