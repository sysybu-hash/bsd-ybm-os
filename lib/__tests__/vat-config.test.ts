import {
  DEFAULT_VAT_RATE_PERCENT,
  formatVatPercent,
  resolveVatRatePercent,
  vatRateDecimal,
} from "@/lib/vat-config";

describe("resolveVatRatePercent", () => {
  it("returns default for null/undefined/invalid", () => {
    expect(resolveVatRatePercent(null)).toBe(DEFAULT_VAT_RATE_PERCENT);
    expect(resolveVatRatePercent(undefined)).toBe(DEFAULT_VAT_RATE_PERCENT);
    expect(resolveVatRatePercent(-1)).toBe(DEFAULT_VAT_RATE_PERCENT);
    expect(resolveVatRatePercent(Number.NaN)).toBe(DEFAULT_VAT_RATE_PERCENT);
  });

  it("returns org percent when valid", () => {
    expect(resolveVatRatePercent(17)).toBe(17);
    expect(resolveVatRatePercent(0)).toBe(0);
  });
});

describe("vatRateDecimal", () => {
  it("converts percent to decimal", () => {
    expect(vatRateDecimal(18)).toBeCloseTo(0.18);
  });

  it("falls back to default for bad input", () => {
    expect(vatRateDecimal(-5)).toBeCloseTo(DEFAULT_VAT_RATE_PERCENT / 100);
  });
});

describe("formatVatPercent", () => {
  it("formats integers without decimals", () => {
    expect(formatVatPercent(18)).toBe("18");
  });

  it("formats fractional rates", () => {
    expect(formatVatPercent(17.5)).toBe("17.50");
  });
});
