jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/env", () => ({ env: {} }));

import { isSuperAdminEmail, parseAdminEmails } from "@/lib/vmb/admin";

describe("VMB super admins", () => {
  const list = parseAdminEmails(" Boss@Example.com, ,second@example.org ");

  it("parses a comma list, trimmed and lower-cased", () => {
    expect([...list]).toEqual(["boss@example.com", "second@example.org"]);
    expect(parseAdminEmails(undefined).size).toBe(0);
  });

  it("admits a listed address only when Google verified it", () => {
    expect(isSuperAdminEmail("BOSS@example.com", true, list)).toBe(true);
    expect(isSuperAdminEmail("boss@example.com", false, list)).toBe(false);
    expect(isSuperAdminEmail("other@example.com", true, list)).toBe(false);
  });
});
