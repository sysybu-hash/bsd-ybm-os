/**
 * @jest-environment node
 */
/** The building booklet's create route is the measured visualisation: closed to an organisation without an active subscription. */

const mockAccess = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/lib/api-handler", () => ({
  withWorkspacesAuth: (handler: (req: Request, ctx: { orgId: string; userId: string; role: string }) => Promise<Response>) => (req: Request) =>
    handler(req, { orgId: "org-1", userId: "user-1", role: "ORG_ADMIN" }),
}));
jest.mock("@/lib/api-route-helpers", () => ({
  apiErrorResponse: (err: unknown) => new Response(err instanceof Error ? err.message : String(err), { status: 500 }),
}));
jest.mock("@/lib/rate-limit", () => ({ applyRateLimit: async () => null }));
jest.mock("@/lib/industry-api-guard", () => ({ guardConstructionOnlyApi: async () => null }));
jest.mock("@/lib/projects/project-access", () => ({ requireProjectForOrg: async () => ({ ok: true }) }));
jest.mock("@/lib/projects/floorplan-blob", () => ({ isFloorplanBlobUrl: () => true }));
jest.mock("@/lib/projects/viz-access", () => ({ vizAccessForUser: (...a: unknown[]) => mockAccess(...a) }));
jest.mock("@/lib/projects/building/booklet-job", () => ({
  createBookletJob: (...a: unknown[]) => mockCreate(...a),
  listBookletJobs: async () => [],
  scheduleNextStep: async () => true,
}));

import { POST } from "@/app/api/projects/building-booklet/route";

const request = () =>
  new Request("http://localhost/api/projects/building-booklet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blobUrl: "https://blob.example/strip.dwf", name: "בניין" }),
  });

describe("POST /api/projects/building-booklet — subscriber access", () => {
  beforeEach(() => {
    mockAccess.mockReset();
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: "job-1" });
  });

  it("refuses an organisation without an active subscription, before any job is made", async () => {
    mockAccess.mockResolvedValue({ subscriber: false, paint: false, contactEmail: "x" });
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(mockAccess).toHaveBeenCalledWith("user-1", "org-1");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("starts the job for a subscriber", async () => {
    mockAccess.mockResolvedValue({ subscriber: true, paint: false, contactEmail: "x" });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
