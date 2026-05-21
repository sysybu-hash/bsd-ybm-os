import {
  assignContactProject,
  evaluateContactProjectChange,
  resolvePrimaryContactId,
  syncContactToProject,
  syncProjectCrmContact,
} from "@/lib/workspace-api/project-crm-sync";

const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockUpdate = jest.fn();

const mockProjectFindFirst = jest.fn();
const mockProjectUpdate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
      update: (...args: unknown[]) => mockProjectUpdate(...args),
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

  it("syncContactToProject sets primaryContactId when autoSyncCrm", async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: "p1",
      autoSyncCrm: true,
      primaryContactId: null,
      crmSyncPolicyJson: { syncDirection: "bidirectional" },
    });
    await syncContactToProject("c1", "p1", "org1");
    expect(mockProjectUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { primaryContactId: "c1" },
    });
  });

  it("assignContactProject updates contact and syncs project", async () => {
    mockFindFirst.mockResolvedValue({ projectId: null });
    mockProjectFindFirst.mockResolvedValue({
      id: "p1",
      autoSyncCrm: true,
      primaryContactId: null,
      crmSyncPolicyJson: {},
    });
    await assignContactProject("c1", "p1", "org1");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { projectId: "p1" },
    });
  });

  it("evaluateContactProjectChange blocks when policy is block", async () => {
    mockFindFirst.mockResolvedValue({ projectId: "p-old" });
    mockProjectFindFirst.mockResolvedValue({
      name: "פרויקט חדש",
      crmSyncPolicyJson: { onContactProjectChange: "block" },
    });
    const r = await evaluateContactProjectChange("c1", "p-new", "org1");
    expect(r.allowed).toBe(false);
  });
});
