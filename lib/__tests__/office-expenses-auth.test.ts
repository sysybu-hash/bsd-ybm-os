import {
  canManageOfficeExpenses,
  canViewOfficeExpenses,
  OFFICE_EXPENSE_MANAGE_ROLES,
  OFFICE_EXPENSE_VIEW_ROLES,
} from "@/lib/office-expenses-auth";

describe("office-expenses-auth", () => {
  it("allows managers to view office expenses", () => {
    expect(canViewOfficeExpenses("ORG_ADMIN")).toBe(true);
    expect(canViewOfficeExpenses("SUPER_ADMIN")).toBe(true);
    expect(canViewOfficeExpenses("PROJECT_MGR")).toBe(true);
    expect(canViewOfficeExpenses("EMPLOYEE")).toBe(false);
    expect(canViewOfficeExpenses("CLIENT")).toBe(false);
  });

  it("allows only org admins to manage office expenses", () => {
    expect(canManageOfficeExpenses("ORG_ADMIN")).toBe(true);
    expect(canManageOfficeExpenses("SUPER_ADMIN")).toBe(true);
    expect(canManageOfficeExpenses("PROJECT_MGR")).toBe(false);
    expect(canManageOfficeExpenses("EMPLOYEE")).toBe(false);
  });

  it("exports role allowlists for API routes", () => {
    expect(OFFICE_EXPENSE_VIEW_ROLES).toEqual(["ORG_ADMIN", "SUPER_ADMIN", "PROJECT_MGR"]);
    expect(OFFICE_EXPENSE_MANAGE_ROLES).toEqual(["ORG_ADMIN", "SUPER_ADMIN"]);
  });
});
