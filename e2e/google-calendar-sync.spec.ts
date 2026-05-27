import { test, expect } from "@playwright/test";

test.describe("Google Calendar sync (settings suggest flow)", () => {
  test("settings API returns suggest shape when sync inactive", async ({ request }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "דורש E2E_SESSION_COOKIE לאימות workspace",
    );

    const res = await request.get("/api/integrations/google-calendar/settings", {
      headers: {
        Cookie: process.env.E2E_SESSION_COOKIE ?? "",
      },
    });

    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const data = (await res.json()) as { suggested?: boolean; active?: boolean };
      expect(typeof data.suggested).toBe("boolean");
      expect(typeof data.active).toBe("boolean");
    }
  });
});
