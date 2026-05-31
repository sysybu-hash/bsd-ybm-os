import { isAllowedGroupBy, isAllowedValueField } from "@/lib/app-builder/data-catalog";

describe("app-builder data-catalog", () => {
  it("allows contacts status groupBy and value sum", () => {
    expect(isAllowedGroupBy("contacts", "status")).toBe(true);
    expect(isAllowedValueField("contacts", "value")).toBe(true);
  });

  it("allows tasks status and priority", () => {
    expect(isAllowedGroupBy("tasks", "priority")).toBe(true);
    expect(isAllowedValueField("tasks", "budget")).toBe(false);
  });

  it("allows issuedDocuments type and money fields", () => {
    expect(isAllowedGroupBy("issuedDocuments", "type")).toBe(true);
    expect(isAllowedValueField("issuedDocuments", "total")).toBe(true);
  });
});
