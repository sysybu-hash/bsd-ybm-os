/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useProgressBillPortalData } from "../useProgressBillPortalData";

const t = (key: string) => key;

function jsonRes(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

/** Routes each fetch by URL so tests can assert per-endpoint behaviour. */
function mockFetch(handlers: {
  bills?: () => Promise<Response>;
  projects?: () => Promise<Response>;
  boq?: (pid: string) => Promise<Response>;
}) {
  const calls: string[] = [];
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/progress-bills")) return (handlers.bills ?? (() => jsonRes({ bills: [] })))();
    if (url.match(/\/api\/projects\/[^/]+\/boq/)) {
      const pid = decodeURIComponent(url.split("/api/projects/")[1]?.split("/boq")[0] ?? "");
      return (handlers.boq ?? (() => jsonRes({ lines: [] })))(pid);
    }
    if (url.includes("/api/projects")) return (handlers.projects ?? (() => jsonRes({ projects: [] })))();
    return jsonRes({});
  }) as unknown as typeof fetch;
  return calls;
}

afterEach(() => jest.restoreAllMocks());

describe("useProgressBillPortalData", () => {
  it("loads bills and projects on mount and selects the first project", async () => {
    mockFetch({
      bills: () => jsonRes({ bills: [{ id: "b1" }] }),
      projects: () => jsonRes({ projects: [{ id: "p1" }, { id: "p2" }] }),
    });
    const { result } = renderHook(() => useProgressBillPortalData({ t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bills).toHaveLength(1);
    expect(result.current.projectId).toBe("p1");
  });

  it("surfaces the server message when the bills call fails", async () => {
    mockFetch({ bills: () => jsonRes({ error: "boom" }, false) });
    const { result } = renderHook(() => useProgressBillPortalData({ t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
  });

  it("clears the spinner when the bills call rejects", async () => {
    mockFetch({ bills: () => Promise.reject(new Error("offline")) });
    const { result } = renderHook(() => useProgressBillPortalData({ t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("offline");
  });

  it("seeds executed quantities from the BOQ lines", async () => {
    mockFetch({
      projects: () => jsonRes({ projects: [{ id: "p1" }] }),
      boq: () => jsonRes({ lines: [{ id: "l1", quantity: 4 }, { id: "l2", quantity: null }] }),
    });
    const { result } = renderHook(() => useProgressBillPortalData({ t }));
    await waitFor(() => expect(result.current.boqLines).toHaveLength(2));
    expect(result.current.selected).toEqual({ l1: "4" });
  });

  it("empties the BOQ when no project is selected", async () => {
    mockFetch({ projects: () => jsonRes({ projects: [] }) });
    const { result } = renderHook(() => useProgressBillPortalData({ t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.boqLines).toEqual([]);
    expect(result.current.selected).toEqual({});
  });

  /**
   * The original code had projectId in loadProjects' dependency array, and the
   * mount effect depended on loadProjects — so changing project refetched the
   * bills and the project list as well.
   */
  it("does not refetch bills or projects when the project changes", async () => {
    const calls = mockFetch({
      projects: () => jsonRes({ projects: [{ id: "p1" }, { id: "p2" }] }),
      boq: () => jsonRes({ lines: [] }),
    });
    const { result } = renderHook(() => useProgressBillPortalData({ t }));
    await waitFor(() => expect(result.current.projectId).toBe("p1"));

    const billsBefore = calls.filter((c) => c.includes("/api/progress-bills")).length;
    const projectsBefore = calls.filter((c) => c.endsWith("/api/projects")).length;

    await act(async () => {
      result.current.setProjectId("p2");
    });
    await waitFor(() =>
      expect(calls.some((c) => c.includes("/api/projects/p2/boq"))).toBe(true),
    );

    expect(calls.filter((c) => c.includes("/api/progress-bills")).length).toBe(billsBefore);
    expect(calls.filter((c) => c.endsWith("/api/projects")).length).toBe(projectsBefore);
  });

  it("survives a projects call that rejects", async () => {
    mockFetch({ projects: () => Promise.reject(new Error("nope")) });
    const { result } = renderHook(() => useProgressBillPortalData({ t }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toEqual([]);
  });
});
