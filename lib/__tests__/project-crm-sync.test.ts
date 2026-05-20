import { resolvePrimaryContactId, syncProjectCrmContact } from "@/lib/workspace-api/project-crm-sync";

const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

describe("project-crm-sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("syncProjectCrmContact skips when autoSyncCrm is false", async () => {
    await syncProjectCrmContact("p1", "org1", "c1", false);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("syncProjectCrmContact updates contact projectId when needed", async () => {
    mockFindFirst.mockResolvedValue({ id: "c1", projectId: null });
    await syncProjectCrmContact("p1", "org1", "c1", true);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { projectId: "p1" },
    });
  });

  it("resolvePrimaryContactId picks single project contact when autoSync", async () => {
    mockFindMany.mockResolvedValue([{ id: "only" }]);
    const id = await resolvePrimaryContactId("p1", "org1", null, true);
    expect(id).toBe("only");
  });
});
