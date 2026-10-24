import { isVizPaintEmail } from "@/lib/projects/viz-paint-access";

describe("paid visualisation allowlist", () => {
  it("always allows sysybu@gmail.com", () => {
    expect(isVizPaintEmail("sysybu@gmail.com", "")).toBe(true);
    expect(isVizPaintEmail("  SYSYBU@GMAIL.COM ", undefined)).toBe(true);
  });

  it("allows an address added later", () => {
    expect(isVizPaintEmail("partner@example.com", "partner@example.com, other@example.com")).toBe(true);
    expect(isVizPaintEmail("OTHER@example.com", "partner@example.com; other@example.com")).toBe(true);
  });

  it("refuses a regular subscriber and the platform admin address", () => {
    expect(isVizPaintEmail("yb@bsd-ybm.co.il", "")).toBe(false);
    expect(isVizPaintEmail("subscriber@example.com", "")).toBe(false);
    expect(isVizPaintEmail("", "partner@example.com")).toBe(false);
    expect(isVizPaintEmail(null, null)).toBe(false);
  });
});
