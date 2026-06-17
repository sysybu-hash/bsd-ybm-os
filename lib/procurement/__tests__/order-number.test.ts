import { formatOrderNumber } from "@/lib/procurement/order-number";

describe("formatOrderNumber", () => {
  it("pads sequence to three digits", () => {
    expect(formatOrderNumber(2026, 1)).toBe("PO-2026-001");
    expect(formatOrderNumber(2026, 42)).toBe("PO-2026-042");
    expect(formatOrderNumber(2026, 999)).toBe("PO-2026-999");
  });
});
