import { resolveSiteBaseUrl } from "@/lib/site-url";

describe("resolveSiteBaseUrl", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.NEXTAUTH_URL;
    delete process.env.AUTH_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
  });

  afterAll(() => {
    process.env = env;
  });

  it("prefers NEXTAUTH_URL when set", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000/";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.bsd-ybm.co.il";
    expect(resolveSiteBaseUrl()).toBe("http://localhost:3000");
  });

  it("ignores NEXT_PUBLIC_SITE_URL in development", () => {
    const prev = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.bsd-ybm.co.il";
    expect(resolveSiteBaseUrl()).toBeUndefined();
    (process.env as { NODE_ENV?: string }).NODE_ENV = prev;
  });

  it("uses NEXT_PUBLIC_SITE_URL in production when auth URLs are unset", () => {
    const prev = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.bsd-ybm.co.il/";
    expect(resolveSiteBaseUrl()).toBe("https://www.bsd-ybm.co.il");
    (process.env as { NODE_ENV?: string }).NODE_ENV = prev;
  });
});
