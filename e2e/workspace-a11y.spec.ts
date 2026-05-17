import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dismissCookieBannerIfVisible, tryCredentialsSignIn } from "./helpers";

test.describe("Workspace accessibility", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "bsd-locale", value: "he", url: "http://localhost:3001" }]);
  });

  test("no serious/critical axe violations on workspace chrome", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "דסקטופ");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");
    await dismissCookieBannerIfVisible(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });
});
