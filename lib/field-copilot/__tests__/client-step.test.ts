import {
  mapProjectRow,
  mapContactRow,
  mergeSearchResults,
  canAdvanceFromClientStep,
  canAdvanceFromCaptureStep,
  canAdvanceFromReviewStep,
} from "../client-step";

describe("mapProjectRow", () => {
  it("maps a project to ResultRow", () => {
    const row = mapProjectRow({ id: "p1", name: "Test Project" });
    expect(row).toEqual({
      key: "project:p1",
      kind: "project",
      name: "Test Project",
      subtitle: null,
      contactId: null,
      contactName: null,
      projectId: "p1",
      projectName: "Test Project",
    });
  });
});

describe("mapContactRow", () => {
  it("maps a contact without project", () => {
    const row = mapContactRow({ id: "c1", name: "Alice" });
    expect(row).toMatchObject({ kind: "contact", contactId: "c1", projectId: null });
  });

  it("picks up linked project from contact.project", () => {
    const row = mapContactRow({ id: "c1", name: "Alice", project: { id: "p1", name: "Proj" } });
    expect(row.projectId).toBe("p1");
    expect(row.subtitle).toBe("Proj");
  });

  it("falls back to contact.projectId when no project object", () => {
    const row = mapContactRow({ id: "c1", name: "Alice", projectId: "p2" });
    expect(row.projectId).toBe("p2");
    expect(row.subtitle).toBeNull();
  });
});

describe("mergeSearchResults", () => {
  it("returns up to 8 results", () => {
    const contacts = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }));
    const result = mergeSearchResults(contacts, []);
    expect(result.length).toBe(8);
  });

  it("deduplicates contacts from preview", () => {
    const contacts = [{ id: "c1", name: "Alice" }];
    const preview = [{ type: "contact" as const, id: "c1", name: "Alice" }];
    const result = mergeSearchResults(contacts, preview);
    expect(result.filter((r) => r.contactId === "c1")).toHaveLength(1);
  });

  it("deduplicates projects by projectId", () => {
    const contacts = [{ id: "c1", name: "Alice", project: { id: "p1", name: "Proj" } }];
    const preview = [{ type: "project" as const, id: "p1", name: "Proj" }];
    const result = mergeSearchResults(contacts, preview);
    expect(result.filter((r) => r.projectId === "p1")).toHaveLength(1);
  });

  it("adds novel projects from preview", () => {
    const contacts: never[] = [];
    const preview = [{ type: "project" as const, id: "p1", name: "NewProj" }];
    const result = mergeSearchResults(contacts, preview);
    expect(result.some((r) => r.projectId === "p1")).toBe(true);
  });
});

describe("canAdvanceFromClientStep", () => {
  it("returns false for null draft", () => {
    expect(canAdvanceFromClientStep(null)).toBe(false);
  });

  it("returns true when contactName is set", () => {
    expect(canAdvanceFromClientStep({ contactName: "Alice" } as never)).toBe(true);
  });

  it("returns true when projectId is set", () => {
    expect(canAdvanceFromClientStep({ projectId: "p1" } as never)).toBe(true);
  });

  it("returns false when both are empty", () => {
    expect(canAdvanceFromClientStep({ contactName: "", projectId: null } as never)).toBe(false);
  });
});

describe("canAdvanceFromCaptureStep", () => {
  it("returns false for null draft", () => {
    expect(canAdvanceFromCaptureStep(null)).toBe(false);
  });

  it("returns true when transcript is set", () => {
    const draft = { capture: { transcript: "hello world", photoAssetIds: [], videoAssetId: null } };
    expect(canAdvanceFromCaptureStep(draft as never)).toBe(true);
  });

  it("returns true when photos exist", () => {
    const draft = { capture: { transcript: "", photoAssetIds: ["photo1"], videoAssetId: null } };
    expect(canAdvanceFromCaptureStep(draft as never)).toBe(true);
  });

  it("returns false when capture is empty", () => {
    const draft = { capture: { transcript: "", photoAssetIds: [], videoAssetId: null } };
    expect(canAdvanceFromCaptureStep(draft as never)).toBe(false);
  });
});

describe("canAdvanceFromReviewStep", () => {
  it("returns false for null", () => {
    expect(canAdvanceFromReviewStep(null)).toBe(false);
  });

  it("returns true when lineItems has description", () => {
    const draft = { analysis: { lineItems: [{ description: "Tiles" }] } };
    expect(canAdvanceFromReviewStep(draft as never)).toBe(true);
  });

  it("returns false when lineItems is empty", () => {
    const draft = { analysis: { lineItems: [], billOfQuantities: [] } };
    expect(canAdvanceFromReviewStep(draft as never)).toBe(false);
  });
});
