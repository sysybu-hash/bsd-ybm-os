/**
 * @jest-environment node
 */

const incr = jest.fn();
const pexpire = jest.fn();
const pttl = jest.fn();
const get = jest.fn();
const redisMock = { incr, pexpire, pttl, get };
let redisClient: typeof redisMock | null = null;

jest.mock("@/lib/upstash-redis", () => ({
  getUpstashRedis: () => redisClient,
  __resetUpstashRedisForTests: jest.fn(),
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
import { checkRateLimit, getRateLimitStatus } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient = null;
  });

  it("uses Redis when Upstash client is available", async () => {
    redisClient = redisMock;
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
    redisClient = null;

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
    redisClient = redisMock;
    get.mockResolvedValue(3);
    pttl.mockResolvedValue(30_000);

    const status = await getRateLimitStatus("scan:demo", 10, 60_000);
    expect(status.used).toBe(3);
    expect(status.remaining).toBe(7);
    expect(incr).not.toHaveBeenCalled();
  });
});
