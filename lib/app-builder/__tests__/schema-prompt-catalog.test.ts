import { dataCatalogForPrompt } from "@/lib/app-builder/data-catalog";
import { APP_BUILDER_SYSTEM_PROMPT } from "@/lib/app-builder/system-prompt";

/**
 * The model that builds a dashboard schema must be told which dataConfig
 * combinations are legal.
 *
 * `validateConfig` in app/actions/dashboard-data.ts rejects anything outside
 * data-catalog.ts and the rejection is rendered into the card — a generated
 * dashboard came back showing "invalid_value_field" and "invalid_group_by"
 * where the numbers belonged. The catalogue existed, and was only ever shown to
 * the chat model; the schema generator was guessing against an allowlist it
 * could not see.
 */
describe("app builder schema prompt", () => {
  it("describes every table with its allowed groupBy and valueField", () => {
    const catalog = dataCatalogForPrompt();

    for (const table of ["projects", "expenses", "contacts", "tasks", "issuedDocuments"]) {
      expect(catalog).toContain(table);
    }
    // Spot-check the two that carry money, since those are what metric cards sum.
    expect(catalog).toMatch(/projects:.*valueField budget/);
    expect(catalog).toMatch(/expenses:.*valueField total \| amountNet \| vat/);
  });

  it("only advertises fields the renderer will actually accept", async () => {
    const { isAllowedGroupBy, isAllowedValueField } = await import(
      "@/lib/app-builder/data-catalog"
    );

    // Parse the prompt text back out and check each claim against the validator,
    // so the two can never drift apart silently.
    for (const line of dataCatalogForPrompt().split("\n")) {
      const table = line.match(/^- (\w+):/)?.[1];
      if (!table) continue;

      const groupBy = line.match(/groupBy ([^;]+);/)?.[1]?.trim() ?? "";
      const values = line.match(/valueField ([^;]+);/)?.[1]?.trim() ?? "";

      for (const g of groupBy.split("|").map((x) => x.trim()).filter((x) => x && x !== "—")) {
        expect(isAllowedGroupBy(table as never, g)).toBe(true);
      }
      for (const v of values.split("|").map((x) => x.trim()).filter((x) => x && x !== "—")) {
        expect(isAllowedValueField(table as never, v)).toBe(true);
      }
    }
  });

  it("still names the tables in the base prompt", () => {
    expect(APP_BUILDER_SYSTEM_PROMPT).toContain("targetTable");
  });
});
