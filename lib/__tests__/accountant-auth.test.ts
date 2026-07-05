import {
  isAccountantRole,
  isReadOnlyOrgRole,
  isSafeHttpMethod,
  shouldBlockReadOnlyRole,
} from "@/lib/accountant-auth";

describe("accountant-auth", () => {
  it("identifies the accountant role case-insensitively", () => {
    expect(isAccountantRole("ACCOUNTANT")).toBe(true);
    expect(isAccountantRole("accountant")).toBe(true);
    expect(isAccountantRole("ORG_ADMIN")).toBe(false);
    expect(isAccountantRole(null)).toBe(false);
  });

  it("treats only ACCOUNTANT as a read-only org role", () => {
    expect(isReadOnlyOrgRole("ACCOUNTANT")).toBe(true);
    expect(isReadOnlyOrgRole("PROJECT_MGR")).toBe(false);
    expect(isReadOnlyOrgRole("ORG_ADMIN")).toBe(false);
  });

  it("classifies safe HTTP methods", () => {
    expect(isSafeHttpMethod("GET")).toBe(true);
    expect(isSafeHttpMethod("head")).toBe(true);
    expect(isSafeHttpMethod("OPTIONS")).toBe(true);
    expect(isSafeHttpMethod("POST")).toBe(false);
    expect(isSafeHttpMethod("DELETE")).toBe(false);
  });

  describe("shouldBlockReadOnlyRole", () => {
    it("blocks an accountant on write methods", () => {
      expect(shouldBlockReadOnlyRole("ACCOUNTANT", "POST", undefined)).toBe(true);
      expect(shouldBlockReadOnlyRole("ACCOUNTANT", "PATCH", false)).toBe(true);
      expect(shouldBlockReadOnlyRole("ACCOUNTANT", "DELETE", undefined)).toBe(true);
    });

    it("allows an accountant on read methods", () => {
      expect(shouldBlockReadOnlyRole("ACCOUNTANT", "GET", undefined)).toBe(false);
      expect(shouldBlockReadOnlyRole("ACCOUNTANT", "HEAD", undefined)).toBe(false);
    });

    it("allows a write when the route opts in (e.g. file export)", () => {
      expect(shouldBlockReadOnlyRole("ACCOUNTANT", "POST", true)).toBe(false);
    });

    it("never blocks non-read-only roles", () => {
      expect(shouldBlockReadOnlyRole("ORG_ADMIN", "DELETE", undefined)).toBe(false);
      expect(shouldBlockReadOnlyRole("PROJECT_MGR", "POST", undefined)).toBe(false);
      expect(shouldBlockReadOnlyRole("EMPLOYEE", "PATCH", undefined)).toBe(false);
    });
  });
});
