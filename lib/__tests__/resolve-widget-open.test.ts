import { mapLauncherWidgetId, resolveWidgetOpen } from "@/lib/os-assistant/resolve-widget-open";

describe("resolveWidgetOpen", () => {
  it("maps dashboard to financeHub overview tab", () => {
    const req = resolveWidgetOpen("dashboard", null);
    expect(req?.type).toBe("financeHub");
    expect(req?.liveData?.tab).toBe("overview");
  });

  it("maps docCreator to documentsHub create tab", () => {
    const req = resolveWidgetOpen("docCreator", { issuedDocumentId: "x" });
    expect(req?.type).toBe("documentsHub");
    expect(req?.liveData?.tab).toBe("create");
    expect(req?.liveData?.issuedDocumentId).toBe("x");
  });

  it("maps project to projectsHub with projectId", () => {
    const req = resolveWidgetOpen("project", { projectId: "p1", name: "א" });
    expect(req?.type).toBe("projectsHub");
    expect(req?.liveData?.tab).toBe("project");
    expect(req?.liveData?.projectId).toBe("p1");
  });

  it("maps quoteGen to documentsHub create tab", () => {
    const req = resolveWidgetOpen("quoteGen", null);
    expect(req?.type).toBe("documentsHub");
    expect(req?.liveData?.tab).toBe("create");
  });

  it("maps googleCalendar without hub redirect", () => {
    const req = resolveWidgetOpen("googleCalendar", null);
    expect(req?.type).toBe("googleCalendar");
  });
});

describe("mapLauncherWidgetId", () => {
  it("normalizes legacy grid ids to hubs", () => {
    expect(mapLauncherWidgetId("dashboard")).toBe("financeHub");
    expect(mapLauncherWidgetId("aiChatFull")).toBe("aiHub");
    expect(mapLauncherWidgetId("crmTable")).toBe("crmTable");
  });
});
