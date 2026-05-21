import { resolveShellDesktopDimensions } from "@/lib/workspace/window-layout-policy";

describe("resolveShellDesktopDimensions", () => {
  const desktopWorkspace = { width: 1400, height: 900 };

  it("keeps width at least 720 on typical desktop workspace", () => {
    const dim = resolveShellDesktopDimensions(desktopWorkspace, { width: 600, height: 450 });
    expect(dim.width).toBeGreaterThanOrEqual(720);
    expect(dim.height).toBeGreaterThanOrEqual(600);
  });

  it("does not shrink to 360px when preferred size is small", () => {
    const dim = resolveShellDesktopDimensions(desktopWorkspace, { width: 360, height: 280 });
    expect(dim.width).toBeGreaterThanOrEqual(900);
    expect(dim.height).toBeGreaterThanOrEqual(600);
  });

  it("fits within workspace bounds", () => {
    const dim = resolveShellDesktopDimensions(desktopWorkspace, { width: 2000, height: 2000 });
    expect(dim.width).toBeLessThanOrEqual(desktopWorkspace.width - 16);
    expect(dim.height).toBeLessThanOrEqual(desktopWorkspace.height - 16);
  });
});
