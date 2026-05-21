import { runWorkDiaryDailyReminders } from "@/lib/push/work-diary-rules";

const mockFindManyProjects = jest.fn();
const mockFindManyUsers = jest.fn();
const mockSendPush = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findMany: (...a: unknown[]) => mockFindManyProjects(...a) },
    user: { findMany: (...a: unknown[]) => mockFindManyUsers(...a) },
  },
}));

jest.mock("@/lib/push/send-notification", () => ({
  sendPushToUser: (...a: unknown[]) => mockSendPush(...a),
}));

describe("work-diary-push rules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendPush.mockResolvedValue(1);
    mockFindManyUsers.mockResolvedValue([{ id: "u1" }]);
  });

  it("notifies when active project has no diary in 24h", async () => {
    mockFindManyProjects.mockResolvedValue([
      {
        id: "p1",
        name: "פרויקט בדיקה",
        organizationId: "org1",
        workDiaries: [],
      },
    ]);

    const { notified } = await runWorkDiaryDailyReminders();
    expect(notified).toBeGreaterThan(0);
    expect(mockSendPush).toHaveBeenCalled();
  });

  it("skips projects with recent diary", async () => {
    mockFindManyProjects.mockResolvedValue([
      {
        id: "p1",
        name: "פרויקט",
        organizationId: "org1",
        workDiaries: [{ id: "d1" }],
      },
    ]);

    const { notified } = await runWorkDiaryDailyReminders();
    expect(notified).toBe(0);
    expect(mockSendPush).not.toHaveBeenCalled();
  });
});
