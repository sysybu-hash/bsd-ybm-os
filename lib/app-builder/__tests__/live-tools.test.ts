import { APP_BUILDER_LIVE_TOOL_NAMES, getAppBuilderLiveToolDeclarations } from "@/lib/app-builder/live-tools";

describe("app-builder live-tools", () => {
  it("declares build_ui and update_ui", () => {
    const declarations = getAppBuilderLiveToolDeclarations();
    const names = declarations.map((d) => d.name);
    expect(names).toEqual(["build_ui", "update_ui"]);
    expect(APP_BUILDER_LIVE_TOOL_NAMES.has("build_ui")).toBe(true);
    expect(APP_BUILDER_LIVE_TOOL_NAMES.has("update_ui")).toBe(true);
  });
});
