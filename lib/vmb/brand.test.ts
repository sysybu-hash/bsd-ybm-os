import { publicOrigin } from "@/lib/vmb/brand";

const h = (host: string, forwarded?: string) => new Headers({ host, ...(forwarded ? { "x-forwarded-host": forwarded } : {}) });

describe("publicOrigin", () => {
  it("uses the browser's host, not the dev server's bind address", () => {
    expect(publicOrigin(h("localhost:3000"), "http://0.0.0.0:3000")).toBe("http://localhost:3000");
    expect(publicOrigin(h("vmb.localhost:3000"), "http://0.0.0.0:3000")).toBe("http://vmb.localhost:3000");
  });
  it("prefers the forwarded host and serves known public hosts over https", () => {
    expect(publicOrigin(h("internal:8080", "vmb.bsd-ybm.co.il"), "x")).toBe("https://vmb.bsd-ybm.co.il");
    expect(publicOrigin(h("bsd-ybm-git-x.vercel.app"), "x")).toBe("https://bsd-ybm-git-x.vercel.app");
  });
  it("falls back for an unknown host", () => {
    expect(publicOrigin(h("evil.example.com"), "https://vmb.bsd-ybm.co.il")).toBe("https://vmb.bsd-ybm.co.il");
  });
});
