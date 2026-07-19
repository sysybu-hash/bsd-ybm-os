import { scrubWorkspaceLayout, parseWorkspaceLayoutFromStorage } from "@/lib/workspace/user-workspace-layout";

describe("user-workspace-layout", () => {
  it("scrubs invalid widgets", () => {
    const result = scrubWorkspaceLayout([
      {
        id: "crmTable-1",
        type: "crmTable",
        liveData: null,
        position: { x: 10, y: 20 },
        size: { width: 800, height: 600 },
        zIndex: 101,
      },
      {
        id: "bad-1",
        type: "not-a-widget",
        liveData: null,
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 },
        zIndex: 1,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("crmTable");
  });

  it("parses storage JSON", () => {
    const raw = JSON.stringify([
      {
        id: "aiHub-1",
        type: "aiHub",
        liveData: { tab: "chat" },
        position: { x: 100, y: 50 },
        size: { width: 720, height: 750 },
        zIndex: 102,
        isMaximized: false,
      },
    ]);
    const widgets = parseWorkspaceLayoutFromStorage(raw);
    expect(widgets).toHaveLength(1);
    expect(widgets[0]?.liveData).toEqual({ tab: "chat" });
  });

  it("remaps legacy widget types to hubs on scrub", () => {
    const result = scrubWorkspaceLayout([
      {
        id: "dashboard-1",
        type: "dashboard",
        liveData: null,
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
        zIndex: 1,
      },
      {
        id: "builder-1",
        type: "appBuilder",
        liveData: null,
        position: { x: 10, y: 10 },
        size: { width: 700, height: 500 },
        zIndex: 2,
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe("financeHub");
    expect(result[0]?.liveData).toEqual(expect.objectContaining({ tab: "overview" }));
    expect(result[1]?.type).toBe("aiHub");
    expect(result[1]?.liveData).toEqual(expect.objectContaining({ tab: "builder" }));
  });
});
