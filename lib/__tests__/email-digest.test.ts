import {
  buildDigestPreviewLines,
  EMAIL_DIGEST_CATEGORY,
} from "@/lib/email-digest";

describe("buildDigestPreviewLines", () => {
  it("numbers items and merges title with body when different", () => {
    const lines = buildDigestPreviewLines([
      {
        title: "משימות באיחור",
        body: "3 משימות",
        createdAt: new Date(),
      },
      {
        title: "משימות להיום",
        body: "משימות להיום",
        createdAt: new Date(),
      },
    ]);
    expect(lines[0]).toBe("1. משימות באיחור — 3 משימות");
    expect(lines[1]).toBe("2. משימות להיום");
  });
});

describe("EMAIL_DIGEST_CATEGORY", () => {
  it("has stable category keys", () => {
    expect(EMAIL_DIGEST_CATEGORY.NOTIFICATION).toBe("notification");
    expect(EMAIL_DIGEST_CATEGORY.ADMIN_PENDING_REGISTRATION).toBe(
      "admin_pending_registration",
    );
  });
});
