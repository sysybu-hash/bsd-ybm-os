jest.mock("@/lib/api-json", () => ({
  jsonNotFound: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: jest.fn() },
  },
}));

import { getProjectForOrg } from "@/lib/projects/project-access";
import { prisma } from "@/lib/prisma";

const mockFindFirst = prisma.project.findFirst as jest.Mock;

describe("getProjectForOrg — בידוד ארגון", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("מסנן לפי organizationId ולא מחזיר פרויקט של ארגון אחר", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getProjectForOrg("project-foreign", "org-a");
    expect(result).toBeNull();
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "project-foreign", organizationId: "org-a" },
    });
  });

  it("מחזיר פרויקט רק כששני המזהים תואמים", async () => {
    const project = { id: "p1", organizationId: "org-a", name: "Demo" };
    mockFindFirst.mockResolvedValue(project);

    const result = await getProjectForOrg("p1", "org-a");
    expect(result).toEqual(project);
  });
});
