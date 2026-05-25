import {
  canAdvanceFromCaptureStep,
  canAdvanceFromClientStep,
  canAdvanceFromReviewStep,
} from "@/lib/field-copilot/client-step";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";

function baseDraft(overrides: Partial<FieldCopilotDraft> = {}): FieldCopilotDraft {
  return {
    id: "s1",
    organizationId: "o1",
    userId: "u1",
    capture: { photoAssetIds: [] },
    assumptions: [],
    status: "DRAFT",
    ...overrides,
  };
}

describe("canAdvanceFromClientStep", () => {
  it("allows manual client name", () => {
    expect(
      canAdvanceFromClientStep(
        baseDraft({ contactName: "יוסי כהן", contactId: null }),
      ),
    ).toBe(true);
  });

  it("allows project-only selection", () => {
    expect(
      canAdvanceFromClientStep(baseDraft({ projectId: "p1", projectName: "פרויקט א" })),
    ).toBe(true);
  });
});

describe("canAdvanceFromCaptureStep", () => {
  it("requires capture content", () => {
    expect(canAdvanceFromCaptureStep(baseDraft())).toBe(false);
    expect(
      canAdvanceFromCaptureStep(
        baseDraft({ capture: { photoAssetIds: ["a1"], transcript: "" } }),
      ),
    ).toBe(true);
  });
});

describe("canAdvanceFromReviewStep", () => {
  it("requires a line item description", () => {
    expect(canAdvanceFromReviewStep(baseDraft())).toBe(false);
    expect(
      canAdvanceFromReviewStep(
        baseDraft({ analysis: { lineItems: [{ description: "צביעה", unitPrice: 0 }] } }),
      ),
    ).toBe(true);
  });
});
