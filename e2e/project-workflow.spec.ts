import { test, expect } from "@playwright/test";
import { E2E_PROJECT_ID, tryCredentialsSignIn } from "./helpers";
import fs from "node:fs";
import path from "node:path";

test.describe("project workflow", () => {
  test.skip(!process.env.E2E_EMAIL, "requires E2E credentials");

  test("financial hub and schedule import API", async ({ page, request }) => {
    test.skip(!E2E_PROJECT_ID, "run npm run seed:test first");

    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await page.goto(`/os?widget=project&projectId=${encodeURIComponent(E2E_PROJECT_ID)}`);
    await expect(page.getByText(/מרכז פיננסי|Financial hub/i)).toBeVisible({ timeout: 15000 });

    const xmlPath = path.join(process.cwd(), "e2e/fixtures/schedule-minimal.xml");
    const xml = fs.readFileSync(xmlPath, "utf8");
    const res = await request.post(`/api/projects/${E2E_PROJECT_ID}/import/schedule`, {
      multipart: {
        file: {
          name: "schedule-minimal.xml",
          mimeType: "application/xml",
          buffer: Buffer.from(xml, "utf8"),
        },
        format: "xml",
      },
    });
    expect(res.status()).toBeLessThan(500);
  });
});
