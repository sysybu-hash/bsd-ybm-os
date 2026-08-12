import {
  normalizeContactStatus,
  serializeContactStatus,
  isWonPipelineStatus,
  isLostPipelineStatus,
} from "@/lib/crm/pipeline-status";

describe("pipeline-status", () => {
  it("maps legacy UI statuses", () => {
    expect(normalizeContactStatus("lead")).toBe("LEAD");
    expect(normalizeContactStatus("active")).toBe("QUALIFIED");
    expect(normalizeContactStatus("inactive")).toBe("LOST");
  });

  it("maps legacy DB statuses", () => {
    expect(normalizeContactStatus("ACTIVE")).toBe("QUALIFIED");
    expect(normalizeContactStatus("CLOSED_WON")).toBe("WON");
    expect(normalizeContactStatus("CLOSED_LOST")).toBe("LOST");
  });

  it("serializes to canonical pipeline values", () => {
    expect(serializeContactStatus("active")).toBe("QUALIFIED");
    expect(serializeContactStatus("CLOSED_WON")).toBe("WON");
  });

  it("detects won/lost", () => {
    expect(isWonPipelineStatus("WON")).toBe(true);
    expect(isWonPipelineStatus("CLOSED_WON")).toBe(true);
    expect(isLostPipelineStatus("LOST")).toBe(true);
    expect(isLostPipelineStatus("inactive")).toBe(true);
  });
});
