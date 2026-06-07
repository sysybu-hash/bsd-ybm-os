import { parseWorkspaceUrl, workspaceIntentFingerprint } from "@/lib/workspace-url";

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
