/** @jest-environment node */
const findUnique = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: { organization: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";

describe("guardConstructionOnlyApi", () => {
  beforeEach(() => findUnique.mockReset());

  it("refuses a company-management organisation", async () => {
    findUnique.mockResolvedValue({ industry: "COMPANY_MGMT" });
    const res = await guardConstructionOnlyApi("org_1", "ORG_ADMIN");
    expect(res?.status).toBe(403);
  });

  it("lets a construction organisation through", async () => {
    findUnique.mockResolvedValue({ industry: "CONSTRUCTION" });
    expect(await guardConstructionOnlyApi("org_1", "ORG_ADMIN")).toBeNull();
  });

  it("lets a platform admin through whatever the organisation's line", async () => {
    findUnique.mockResolvedValue({ industry: "COMPANY_MGMT" });
    expect(await guardConstructionOnlyApi("org_1", "SUPER_ADMIN")).toBeNull();
    // It does not even need to look: the role alone decides.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("still refuses when no role is passed", async () => {
    findUnique.mockResolvedValue({ industry: "COMPANY_MGMT" });
    const res = await guardConstructionOnlyApi("org_1");
    expect(res?.status).toBe(403);
  });
});
