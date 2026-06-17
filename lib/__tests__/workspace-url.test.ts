import { parseWorkspaceUrl, workspaceIntentFingerprint, buildProjectWidgetUrl, resolveLegacyWidgetTypes } from "@/lib/workspace-url";

describe("parseWorkspaceUrl", () => {
  it("maps w=project&projectId to projectsHub with tab and projectId", () => {
    const intent = parseWorkspaceUrl(new URLSearchParams("w=project&projectId=p-seed-1"));
    expect(intent?.widgetType).toBe("projectsHub");
    expect(intent?.viewState?.tab).toBe("project");
    expect(intent?.viewState?.projectId).toBe("p-seed-1");
  });

  it("decodes projectsHub state from st param", () => {
    const intent = parseWorkspaceUrl(new URLSearchParams("w=projectsHub&st=t:project,p:abc"));
    expect(intent?.widgetType).toBe("projectsHub");
    expect(intent?.viewState?.tab).toBe("project");
    expect(intent?.viewState?.projectId).toBe("abc");
  });

  it("reads tab query param for projectsHub deep links", () => {
    const intent = parseWorkspaceUrl(new URLSearchParams("w=projectsHub&tab=board"));
    expect(intent?.widgetType).toBe("projectsHub");
    expect(intent?.viewState?.tab).toBe("board");
  });

  it("resolves legacy projectBoard widget to projectsHub", () => {
    const intent = parseWorkspaceUrl(new URLSearchParams("w=projectBoard&projectId=p1"));
    expect(intent?.widgetType).toBe("projectsHub");
    expect(intent?.viewState?.projectId).toBe("p1");
    expect(intent?.viewState?.tab).toBe("board");
  });

  it("buildProjectWidgetUrl points to projectsHub with tab and projectId", () => {
    const url = buildProjectWidgetUrl("p-abc", "board");
    expect(url).toContain("w=projectsHub");
    expect(url).toContain("tab=board");
    expect(url).toContain("projectId=p-abc");
    expect(resolveLegacyWidgetTypes("projectBoard")).toBe("projectsHub");
  });

  it("reads tab query param for executiveHub deep links", () => {
    const intent = parseWorkspaceUrl(new URLSearchParams("w=executiveHub&tab=progressBills"));
    expect(intent?.widgetType).toBe("executiveHub");
    expect(intent?.viewState?.tab).toBe("progressBills");
  });

  it("decodes executiveHub state from st param", () => {
    const intent = parseWorkspaceUrl(new URLSearchParams("w=executiveHub&st=t:overview"));
    expect(intent?.widgetType).toBe("executiveHub");
    expect(intent?.viewState?.tab).toBe("overview");
  });
});

describe("workspaceIntentFingerprint", () => {
  it("matches tab= and st= encodings for the same projectsHub intent", () => {
    const fromTab = parseWorkspaceUrl(new URLSearchParams("w=projectsHub&tab=board"));
    const fromSt = parseWorkspaceUrl(new URLSearchParams("w=projectsHub&st=t:board&wid=projectsHub-1"));
    expect(fromTab).not.toBeNull();
    expect(fromSt).not.toBeNull();
    expect(workspaceIntentFingerprint(fromTab!, { ignoreInstanceId: true })).toBe(
      workspaceIntentFingerprint(fromSt!, { ignoreInstanceId: true }),
    );
  });
});
