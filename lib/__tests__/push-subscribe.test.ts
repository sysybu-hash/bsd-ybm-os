import { z } from "zod";

/** סכימת מנוי — מקביל ל-app/api/push/subscribe/route.ts */
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().optional(),
});

describe("push subscribe schema", () => {
  it("accepts valid subscription payload", () => {
    const parsed = subscribeSchema.parse({
      endpoint: "https://push.example.com/sub/abc",
      keys: { p256dh: "key", auth: "secret" },
      userAgent: "test",
    });
    expect(parsed.endpoint).toContain("https://");
  });

  it("rejects invalid endpoint", () => {
    expect(() =>
      subscribeSchema.parse({
        endpoint: "not-a-url",
        keys: { p256dh: "k", auth: "a" },
      }),
    ).toThrow();
  });
});
