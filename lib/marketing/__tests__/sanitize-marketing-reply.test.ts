import { sanitizeMarketingAssistantReply } from "@/lib/marketing/sanitize-marketing-reply";

describe("sanitizeMarketingAssistantReply", () => {
  it("replaces localhost URLs with production site", () => {
    const out = sanitizeMarketingAssistantReply(
      "האתר: http://localhost:3000/login?mode=register",
    );
    expect(out).toContain("https://www.bsd-ybm.co.il");
    expect(out).not.toContain("localhost");
  });
});
