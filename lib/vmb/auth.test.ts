/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/env", () => ({
  env: { VMB_GOOGLE_CLIENT_ID: "client-123", VMB_GOOGLE_CLIENT_SECRET: "secret", NODE_ENV: "test" },
}));

const mockDb = {
  vmbUser: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  vmbPasswordCredential: { deleteMany: jest.fn() },
  vmbSession: { deleteMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(async (ops: unknown[]) => ops),
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { checkIdClaims, decodePending, encodePending, safeNext, startGoogleAuth } from "@/lib/vmb/google-oauth";
import { hashSessionToken, newSessionToken, readVmbSession } from "@/lib/vmb/session";
import { loginWithPassword, registerWithPassword, upsertGoogleUser } from "@/lib/vmb/accounts";

const NOW = 1_800_000_000;
const goodClaims = {
  iss: "https://accounts.google.com",
  aud: "client-123",
  sub: "g-1",
  exp: NOW + 600,
  email: "Arch@Example.com",
  email_verified: true,
  nonce: "n-1",
  name: "אדריכל",
};

beforeEach(() => jest.clearAllMocks());

describe("google oauth", () => {
  it("accepts matching claims", () => {
    expect(checkIdClaims(goodClaims, { clientId: "client-123", nonce: "n-1", nowSec: NOW }).sub).toBe("g-1");
  });

  it.each([
    ["wrong audience", { aud: "other" }],
    ["expired", { exp: NOW - 1 }],
    ["wrong nonce", { nonce: "n-2" }],
    ["unverified email", { email_verified: false }],
    ["foreign issuer", { iss: "https://evil.example" }],
  ])("rejects %s", (_name, patch) => {
    expect(() => checkIdClaims({ ...goodClaims, ...patch }, { clientId: "client-123", nonce: "n-1", nowSec: NOW })).toThrow();
  });

  it("keeps only same-site relative next paths", () => {
    expect(safeNext("/vmb/app")).toBe("/vmb/app");
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext("https://evil.example")).toBe("/app");
    expect(safeNext("/\\evil")).toBe("/app");
    expect(safeNext(null)).toBe("/app");
  });

  it("builds a PKCE request and round-trips its pending state", () => {
    const { url, pending } = startGoogleAuth("https://vmb.bsd-ybm.co.il", "/app");
    const u = new URL(url);
    expect(u.searchParams.get("redirect_uri")).toBe("https://vmb.bsd-ybm.co.il/api/vmb/auth/google/callback");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(pending.state);
    expect(u.searchParams.get("code_challenge")).not.toBe(pending.verifier);
    expect(decodePending(encodePending(pending))).toEqual(pending);
    expect(decodePending("not-base64-json")).toBeNull();
  });
});

describe("sessions", () => {
  it("stores only a hash of the token", () => {
    const token = newSessionToken();
    expect(token.length).toBeGreaterThan(40);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("drops an expired session", async () => {
    mockDb.vmbSession.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1000),
      lastSeenAt: new Date(),
      user: { id: "u1", email: "a@b.co", name: null, image: null },
    });
    await expect(readVmbSession(newSessionToken())).resolves.toBeNull();
    expect(mockDb.vmbSession.deleteMany).toHaveBeenCalled();
  });

  it("ignores junk tokens without touching the database", async () => {
    await expect(readVmbSession("short")).resolves.toBeNull();
    expect(mockDb.vmbSession.findUnique).not.toHaveBeenCalled();
  });
});

describe("accounts", () => {
  it("refuses a weak password and an existing email", async () => {
    await expect(registerWithPassword({ email: "a@b.co", password: "short" })).resolves.toEqual({ ok: false, code: "weak" });
    mockDb.vmbUser.findUnique.mockResolvedValue({ id: "u1" });
    await expect(registerWithPassword({ email: "a@b.co", password: "LongEnough1234" })).resolves.toEqual({ ok: false, code: "exists" });
  });

  it("gives the same answer for a missing account and a wrong password", async () => {
    mockDb.vmbUser.findUnique.mockResolvedValue(null);
    await expect(loginWithPassword("nobody@b.co", "whatever")).resolves.toEqual({ ok: false, code: "invalid" });
  });

  it("Google takes over an unverified same-email account and removes its password", async () => {
    mockDb.vmbUser.findUnique.mockImplementation(async ({ where }: { where: { googleSub?: string; email?: string } }) =>
      where.googleSub ? null : { id: "squat", emailVerified: false, name: null },
    );
    await expect(upsertGoogleUser({ ...goodClaims, iss: "https://accounts.google.com" })).resolves.toBe("squat");
    expect(mockDb.vmbPasswordCredential.deleteMany).toHaveBeenCalledWith({ where: { userId: "squat" } });
    expect(mockDb.vmbSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "squat" } });
    expect(mockDb.vmbUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ googleSub: "g-1", emailVerified: true }) }),
    );
  });

  it("Google keeps a verified account's password", async () => {
    mockDb.vmbUser.findUnique.mockImplementation(async ({ where }: { where: { googleSub?: string } }) =>
      where.googleSub ? null : { id: "u2", emailVerified: true, name: "x" },
    );
    await upsertGoogleUser({ ...goodClaims, iss: "https://accounts.google.com" });
    expect(mockDb.vmbPasswordCredential.deleteMany).not.toHaveBeenCalled();
  });

  it("creates a new account with a lower-cased email", async () => {
    mockDb.vmbUser.findUnique.mockResolvedValue(null);
    mockDb.vmbUser.create.mockResolvedValue({ id: "new" });
    await expect(upsertGoogleUser({ ...goodClaims, iss: "https://accounts.google.com" })).resolves.toBe("new");
    expect(mockDb.vmbUser.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: "arch@example.com" }) }));
  });
});
