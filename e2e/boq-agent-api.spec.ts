import { test, expect } from "@playwright/test";

test.describe("BOQ agent API", () => {
  test("POST without session is rejected", async ({ request }) => {
    const res = await request.post("/api/projects/demo-project/boq/agent", {
      data: { message: "hello" },
      headers: { "content-type": "application/json" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});
