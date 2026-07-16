/**
 * @jest-environment node
 */
import { requiresItaAllocation, getItaAllocationThresholdNis } from "@/lib/ita-allocation-rules";

jest.mock("@/lib/env", () => ({
  env: {
    ITA_PRODUCTION_KEY: undefined as string | undefined,
    ALLOW_ITA_MOCK: false as boolean | undefined,
  },
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { env } from "@/lib/env";
import {
  requestItaAllocation,
  isItaMockAllowed,
  isItaProductionConfigured,
} from "@/lib/services/ita-service";

describe("ita-allocation-rules", () => {
  it("threshold drops to 5000 from June 2026", () => {
    expect(getItaAllocationThresholdNis(new Date("2026-05-31T12:00:00.000Z"))).toBe(10_000);
    expect(getItaAllocationThresholdNis(new Date("2026-06-01T00:00:00.000Z"))).toBe(5_000);
  });

  it("skips ITA for quotes and small invoices", () => {
    expect(requiresItaAllocation("QUOTE", 50_000)).toBe(false);
    expect(requiresItaAllocation("INVOICE", 100, new Date("2026-07-01"))).toBe(false);
  });

  it("requires ITA for large invoices", () => {
    expect(requiresItaAllocation("INVOICE", 6_000, new Date("2026-07-01"))).toBe(true);
  });
});

describe("requestItaAllocation", () => {
  beforeEach(() => {
    (env as { ITA_PRODUCTION_KEY?: string }).ITA_PRODUCTION_KEY = undefined;
    (env as { ALLOW_ITA_MOCK?: boolean }).ALLOW_ITA_MOCK = false;
  });

  it("skips when below threshold", async () => {
    const r = await requestItaAllocation(100, "123", "inv-1", {
      docType: "INVOICE",
      asOf: new Date("2026-07-01"),
    });
    expect(r.success).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.allocationNumber).toBeUndefined();
  });

  it("fails hard when allocation required and no key / no mock", async () => {
    const r = await requestItaAllocation(20_000, "123", "inv-2", {
      docType: "INVOICE",
      asOf: new Date("2026-07-01"),
    });
    expect(r.success).toBe(false);
    expect(r.isMock).toBe(false);
    expect(r.allocationNumber).toBeUndefined();
    expect(r.error).toMatch(/ITA|הקצאה|רשות/i);
  });

  it("returns mock only when ALLOW_ITA_MOCK is true", async () => {
    (env as { ALLOW_ITA_MOCK?: boolean }).ALLOW_ITA_MOCK = true;
    expect(isItaMockAllowed()).toBe(true);
    const r = await requestItaAllocation(20_000, "123", "inv-3", {
      docType: "INVOICE",
      asOf: new Date("2026-07-01"),
    });
    expect(r.success).toBe(true);
    expect(r.isMock).toBe(true);
    expect(r.allocationNumber).toMatch(/^\d{9}$/);
  });

  it("fails when key set but official API not implemented", async () => {
    (env as { ITA_PRODUCTION_KEY?: string }).ITA_PRODUCTION_KEY = "some-key";
    expect(isItaProductionConfigured()).toBe(true);
    const r = await requestItaAllocation(20_000, "123", "inv-4", {
      docType: "INVOICE",
      asOf: new Date("2026-07-01"),
    });
    expect(r.success).toBe(false);
    expect(r.isMock).toBe(false);
    expect(r.allocationNumber).toBeUndefined();
    expect(r.error).toMatch(/API|לא פעיל/i);
  });
});
