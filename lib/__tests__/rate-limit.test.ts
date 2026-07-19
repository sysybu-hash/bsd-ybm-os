/**
 * @jest-environment node
 */

const incr = jest.fn();
const pexpire = jest.fn();
const pttl = jest.fn();
const get = jest.fn();

jest.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({ incr, pexpire, pttl, get }),
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimit: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  __resetRateLimitRedisForTests,
  checkRateLimit,
  getRateLimitStatus,
} from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  const prevUrl = process.env.UPSTASH_REDIS_REST_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetRateLimitRedisForTests();
  });

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = prevUrl;
    __resetRateLimitRedisForTests();
  });

  it("uses Redis when Upstash env is set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    incr.mockResolvedValue(1);
    pexpire.mockResolvedValue(1);
    pttl.mockResolvedValue(60_000);

    const result = await checkRateLimit("rl:test:ip", 10, 60_000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(9);
    expect(incr).toHaveBeenCalledWith("rl:test:ip");
    expect(prisma.rateLimit.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to Prisma when Redis is unavailable", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    __resetRateLimitRedisForTests();

    (prisma.rateLimit.findUnique as jest.Mock).mockResolvedValue({
      key: "rl:local",
      count: 0,
      resetAt: new Date(Date.now() + 60_000),
    });
    (prisma.rateLimit.update as jest.Mock).mockResolvedValue({
      key: "rl:local",
      count: 1,
      resetAt: new Date(Date.now() + 60_000),
    });

    const result = await checkRateLimit("rl:local", 10, 60_000);
    expect(result.success).toBe(true);
    expect(prisma.rateLimit.update).toHaveBeenCalled();
  });

  it("getRateLimitStatus reads Redis without incrementing", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    get.mockResolvedValue(3);
    pttl.mockResolvedValue(30_000);

    const status = await getRateLimitStatus("scan:demo", 10, 60_000);
    expect(status.used).toBe(3);
    expect(status.remaining).toBe(7);
    expect(incr).not.toHaveBeenCalled();
  });
});
