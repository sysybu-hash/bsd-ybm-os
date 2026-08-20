import { logOfficeExpenseAudit, officeExpenseAuditDetails } from "@/lib/office-expenses-audit";

jest.mock("@/lib/activity-log", () => ({
  logActivity: jest.fn(),
}));

import { logActivity } from "@/lib/activity-log";

const logActivityMock = logActivity as jest.Mock;

describe("office-expenses-audit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("formats audit details as key=value pairs", () => {
    expect(
      officeExpenseAuditDetails({ id: "e1", vendor: "Rent", total: 100, empty: "" }),
    ).toBe("id=e1;vendor=Rent;total=100");
  });

  it("logs office expense actions via activity log", async () => {
    await logOfficeExpenseAudit("user-1", "org-1", "created", "id=e1;vendor=Rent");
    expect(logActivityMock).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "OFFICE_EXPENSE:created",
      "id=e1;vendor=Rent",
    );
  });
});
