jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn(),
}));

import { isFloorplanVizRateLimitOff } from "@/lib/projects/floorplan-viz-rate-limit";

describe("floorplan viz rate limit", () => {
  it("is off outside production so local iteration is not blocked", () => {
    expect(process.env.NODE_ENV).not.toBe("production");
    expect(isFloorplanVizRateLimitOff()).toBe(true);
  });
});
