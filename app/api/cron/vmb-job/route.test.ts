/** @jest-environment node */
jest.mock("server-only", () => ({}));

const mockReady = jest.fn();
const mockRunner = { claimJob: jest.fn(), runClaimed: jest.fn() };
jest.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }));
jest.mock("@/lib/vmb/run-store", () => ({ runnerReady: () => mockReady() }));
jest.mock("@/lib/vmb/runner", () => ({
  claimJob: (...a: unknown[]) => mockRunner.claimJob(...a),
  runClaimed: (...a: unknown[]) => mockRunner.runClaimed(...a),
}));
jest.mock("@/lib/vmb/engine", () => ({ vmbEngine: jest.fn() }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/vmb-job/route";

const call = async (job: string | null, auth = "Bearer s3cret") => {
  const url = `http://localhost/api/cron/vmb-job${job ? `?job=${job}` : ""}`;
  const res = await POST(new NextRequest(url, { method: "POST", headers: { authorization: auth } }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

describe("cron/vmb-job", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockReady.mockReturnValue(true);
  });

  it("refuses a call without the cron secret", async () => {
    expect((await call("j1", "Bearer nope")).status).toBe(401);
    expect(mockRunner.claimJob).not.toHaveBeenCalled();
  });

  it("does nothing while the runner flag is off", async () => {
    mockReady.mockReturnValue(false);
    expect((await call("j1")).json).toEqual({ ready: false });
    expect(mockRunner.claimJob).not.toHaveBeenCalled();
  });

  it("runs the named job, and leaves one already taken", async () => {
    mockRunner.claimJob.mockResolvedValueOnce({ jobId: "j1" });
    mockRunner.runClaimed.mockResolvedValue("done");
    expect((await call("j1")).json).toEqual({ ready: true, ran: "j1", result: "done" });
    expect(mockRunner.claimJob).toHaveBeenCalledWith("j1");
    mockRunner.claimJob.mockResolvedValueOnce(null);
    expect((await call("j1")).json).toEqual({ ready: true, ran: null });
    expect(mockRunner.runClaimed).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing or odd job id", async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call("a%20b")).status).toBe(400);
  });
});
