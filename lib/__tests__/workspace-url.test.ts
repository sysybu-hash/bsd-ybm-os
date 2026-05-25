import { parseWorkspaceUrl } from "@/lib/workspace-url";

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
});
