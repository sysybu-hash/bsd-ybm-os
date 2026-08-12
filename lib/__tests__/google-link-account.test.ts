/**
 * @jest-environment node
 */

jest.mock("@/lib/env", () => ({
  env: {
    NEXTAUTH_SECRET: "test-secret-for-google-link",
    AUTH_SECRET: undefined,
  },
}));

jest.mock("@/lib/site-url", () => ({
  PRODUCTION_SITE_URL: "https://www.example.com",
  resolveSiteBaseUrl: () => "https://www.example.com",
}));

import {
  assertGoogleLinkEmailMatch,
  signGoogleLinkState,
  verifyGoogleLinkState,
} from "@/lib/google-link-account";
import { loginErrorMessages } from "@/lib/auth/login-messages";

describe("google-link-account", () => {
  it("round-trips signed state", () => {
    const token = signGoogleLinkState({
      userId: "u1",
      email: "User@Example.com",
      callbackUrl: "/?w=settings",
    });
    const parsed = verifyGoogleLinkState(token);
    expect(parsed).toMatchObject({
      userId: "u1",
      email: "user@example.com",
      callbackUrl: "/?w=settings",
    });
  });

  it("rejects tampered state", () => {
    const token = signGoogleLinkState({
      userId: "u1",
      email: "a@b.com",
      callbackUrl: "/",
    });
    const [data, sig = ""] = token.split(".", 2);
    expect(verifyGoogleLinkState(`${data}.${sig.slice(0, -1)}x`)).toBeNull();
    expect(verifyGoogleLinkState("not.a.valid")).toBeNull();
  });

  it("requires verified matching email", () => {
    expect(
      assertGoogleLinkEmailMatch({
        sessionEmail: "a@b.com",
        googleEmail: "a@b.com",
        emailVerified: true,
      }),
    ).toEqual({ ok: true, email: "a@b.com" });

    expect(
      assertGoogleLinkEmailMatch({
        sessionEmail: "a@b.com",
        googleEmail: "a@b.com",
        emailVerified: false,
      }).ok,
    ).toBe(false);

    expect(
      assertGoogleLinkEmailMatch({
        sessionEmail: "a@b.com",
        googleEmail: "other@b.com",
        emailVerified: true,
      }).ok,
    ).toBe(false);
  });

  it("documents OAuthAccountNotLinked recovery path (no blind linking)", () => {
    expect(loginErrorMessages.OAuthAccountNotLinked).toMatch(/הגדרות|Settings|סיסמה/i);
    expect(loginErrorMessages.OAuthAccountNotLinked).not.toMatch(/אוטומטית/);
  });
});
