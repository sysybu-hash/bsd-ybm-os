import {
  parseWorkspaceUrl,
  workspaceIntentFingerprint,
  buildProjectWidgetUrl,
  buildWorkspaceSearchParams,
  resolveLegacyWidgetTypes,
} from "@/lib/workspace-url";
import { encodeWidgetState, decodeWidgetState } from "@/lib/workspace-navigation/encoders";

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

  it("normalizes legacy projectsHub tab=board to project center + tasks", () => {
    const intent = parseWorkspaceUrl(new URLSearchParams("w=projectsHub&tab=board"));
    expect(intent?.widgetType).toBe("projectsHub");
    expect(intent?.viewState?.tab).toBe("project");
    expect(intent?.viewState?.dashboardTab).toBe("tasks");
  });

  it("resolves legacy projectBoard widget to projectsHub project center", () => {
    const intent = parseWorkspaceUrl(new URLSearchParams("w=projectBoard&projectId=p1"));
    expect(intent?.widgetType).toBe("projectsHub");
    expect(intent?.viewState?.projectId).toBe("p1");
    expect(intent?.viewState?.tab).toBe("project");
    expect(intent?.viewState?.dashboardTab).toBe("tasks");
  });

  it("buildProjectWidgetUrl points to projectsHub project center with tasks", () => {
    const url = buildProjectWidgetUrl("p-abc", "board");
    expect(url).toContain("w=projectsHub");
    expect(url).toContain("tab=project");
    expect(url).toContain("dt=tasks");
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
  it("matches legacy board encodings after normalize to project+tasks", () => {
    const fromTab = parseWorkspaceUrl(new URLSearchParams("w=projectsHub&tab=board"));
    const fromSt = parseWorkspaceUrl(new URLSearchParams("w=projectsHub&st=t:board&wid=projectsHub-1"));
    expect(fromTab).not.toBeNull();
    expect(fromSt).not.toBeNull();
    expect(workspaceIntentFingerprint(fromTab!, { ignoreInstanceId: true })).toBe(
      workspaceIntentFingerprint(fromSt!, { ignoreInstanceId: true }),
    );
    expect(workspaceIntentFingerprint(fromTab!, { ignoreInstanceId: true })).toContain("tab:project");
    expect(workspaceIntentFingerprint(fromTab!, { ignoreInstanceId: true })).toContain("dt:tasks");
  });
});

describe("inner-view deep links", () => {
  it("encodes and decodes projectsHub dashboard tab", () => {
    const st = encodeWidgetState("projectsHub", {
      tab: "project",
      projectId: "p1",
      dashboardTab: "gantt",
    });
    expect(st).toContain("dt:gantt");
    expect(decodeWidgetState("projectsHub", st)).toEqual({
      tab: "project",
      projectId: "p1",
      dashboardTab: "gantt",
    });
  });

  it("parses dt= and contactId= query params", () => {
    const project = parseWorkspaceUrl(
      new URLSearchParams("w=projectsHub&tab=project&projectId=p1&dt=financial"),
    );
    expect(project?.viewState?.dashboardTab).toBe("financial");
    const crm = parseWorkspaceUrl(new URLSearchParams("w=crmTable&contactId=c-9"));
    expect(crm?.viewState?.contactId).toBe("c-9");
  });

  it("encodes meckano / calendar / jewish calendar views", () => {
    expect(encodeWidgetState("meckanoReports", { tab: "zones" })).toBe("t:zones");
    expect(decodeWidgetState("meckanoReports", "t:people")).toEqual({ tab: "people" });
    expect(encodeWidgetState("googleCalendar", { viewMode: "month" })).toBe("v:month");
    expect(decodeWidgetState("googleCalendar", "v:agenda")).toEqual({ viewMode: "agenda" });
    expect(encodeWidgetState("jewishCalendar", { viewDate: "2026-07-19" })).toBe("d:2026-07-19");
    expect(decodeWidgetState("jewishCalendar", "d:2026-07-19")).toEqual({ viewDate: "2026-07-19" });
  });

  it("builds shareable hub params including project dashboard tab", () => {
    const sp = buildWorkspaceSearchParams({
      widgetType: "projectsHub",
      viewState: { tab: "project", projectId: "p1", dashboardTab: "tasks" },
    });
    expect(sp.get("w")).toBe("projectsHub");
    expect(sp.get("tab")).toBe("project");
    expect(sp.get("projectId")).toBe("p1");
    expect(sp.get("dt")).toBe("tasks");
  });
});
