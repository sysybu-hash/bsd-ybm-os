import { test, expect } from "@playwright/test";

test.describe("auth API smoke", () => {
  test("session endpoint returns JSON", async ({ request }) => {
    const res = await request.get("/api/auth/session");
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual(expect.any(Object));
  });

  test("csrf endpoint returns JSON", async ({ request }) => {
    const res = await request.get("/api/auth/csrf");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { csrfToken?: string };
    expect(typeof body.csrfToken).toBe("string");
  });
});
