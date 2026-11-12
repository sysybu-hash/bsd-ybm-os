jest.mock("server-only", () => ({}));

const mockReady = jest.fn();
const mockRunner = { reapStalledJobs: jest.fn(), claimNextJob: jest.fn(), runClaimed: jest.fn() };
jest.mock("@/lib/vmb/run-store", () => ({ runnerReady: () => mockReady() }));
jest.mock("@/lib/vmb/runner", () => ({
  reapStalledJobs: (...a: unknown[]) => mockRunner.reapStalledJobs(...a),
  claimNextJob: (...a: unknown[]) => mockRunner.claimNextJob(...a),
  runClaimed: (...a: unknown[]) => mockRunner.runClaimed(...a),
}));
jest.mock("@/lib/vmb/engine", () => ({ vmbEngine: jest.fn() }));
jest.mock("@/lib/cron-guard", () => ({
  withCronGuard: async (_req: unknown, _slug: string, _s: unknown, handler: () => Promise<unknown>) => ({ json: await handler() }),
}));

import { GET } from "@/app/api/cron/vmb-runner/route";

const call = () => GET({} as never) as unknown as Promise<{ json: Record<string, unknown> }>;

describe("cron/vmb-runner", () => {
  beforeEach(() => jest.resetAllMocks());

  it("touches nothing while the runner flag is off", async () => {
    mockReady.mockReturnValue(false);
    expect((await call()).json).toEqual({ ready: false });
    expect(mockRunner.reapStalledJobs).not.toHaveBeenCalled();
    expect(mockRunner.claimNextJob).not.toHaveBeenCalled();
  });

  it("reaps, claims one job and runs it", async () => {
    mockReady.mockReturnValue(true);
    mockRunner.reapStalledJobs.mockResolvedValue(1);
    mockRunner.claimNextJob.mockResolvedValue({ jobId: "j1" });
    mockRunner.runClaimed.mockResolvedValue("done");
    expect((await call()).json).toEqual({ ready: true, reaped: 1, ran: "j1", result: "done" });
  });

  it("stops when the queue is empty", async () => {
    mockReady.mockReturnValue(true);
    mockRunner.reapStalledJobs.mockResolvedValue(0);
    mockRunner.claimNextJob.mockResolvedValue(null);
    expect((await call()).json).toEqual({ ready: true, reaped: 0, ran: null });
    expect(mockRunner.runClaimed).not.toHaveBeenCalled();
  });
});
