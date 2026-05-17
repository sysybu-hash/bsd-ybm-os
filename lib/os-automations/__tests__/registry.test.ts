import { AUTOMATION_INTENT_ENUM } from "@/lib/os-automations/catalog";
import { runAutomationAction } from "@/lib/os-automations/registry";
import type { AutomationAction, AutomationIntent, AutomationRunnerDeps } from "@/lib/os-automations/types";

const INTENT_PARAMS: Partial<Record<AutomationIntent, Record<string, unknown>>> = {
  open_widget: { widgetId: "dashboard" },
  scan_with_instructions: { userInstruction: "test" },
  google_assistant_command: { query: "test" },
  edit_issued_document: { documentId: "doc-test" },
  delete_issued_document: { documentId: "doc-test" },
  export_document: { documentId: "doc-test" },
  assign_document_project: { documentId: "doc-test" },
  search_client: { query: "client" },
};

function mockDeps(overrides: Partial<AutomationRunnerDeps> = {}): AutomationRunnerDeps {
  return {
    openWidget: jest.fn(),
    closeWidget: jest.fn(),
    focusWidget: jest.fn(),
    toggleMaximize: jest.fn(),
    clearLayout: jest.fn(),
    widgets: [{ id: "w1", type: "dashboard" }],
    setSystemMessage: jest.fn(),
    ...overrides,
  };
}

describe("runAutomationAction", () => {
  it("opens dashboard via open_dashboard intent", async () => {
    const deps = mockDeps();
    const result = await runAutomationAction({ intent: "open_dashboard" }, deps);
    expect(result.ok).toBe(true);
    expect(deps.openWidget).toHaveBeenCalledWith("dashboard", null);
  });

  it("opens scanner with instructions", async () => {
    const deps = mockDeps();
    await runAutomationAction(
      { intent: "scan_with_instructions", params: { userInstruction: "test" } },
      deps,
    );
    expect(deps.openWidget).toHaveBeenCalledWith(
      "aiScanner",
      expect.objectContaining({ openInstructions: true, userInstruction: "test" }),
    );
  });

  it("clears layout on clear_layout", async () => {
    const deps = mockDeps();
    await runAutomationAction({ intent: "clear_layout" }, deps);
    expect(deps.clearLayout).toHaveBeenCalled();
  });

  const LOCAL_INTENTS = AUTOMATION_INTENT_ENUM.filter(
    (i) => i !== "google_assistant_command" && i !== "search_client",
  );

  it.each(LOCAL_INTENTS)("intent %s returns ok with mock deps", async (intent) => {
    const deps = mockDeps();
    const action: AutomationAction = {
      intent,
      params: INTENT_PARAMS[intent],
    };
    const result = await runAutomationAction(action, deps);
    expect(result.ok).toBe(true);
  });

  it("search_client and google_assistant_command with mocked fetch", async () => {
    const deps = mockDeps();
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], fulfillmentText: "ok" }),
    });
    const prev = globalThis.fetch;
    globalThis.fetch = fetchFn as typeof fetch;
    try {
      expect((await runAutomationAction({ intent: "search_client", params: { query: "x" } }, deps)).ok).toBe(true);
      expect(
        (await runAutomationAction({ intent: "google_assistant_command", params: { query: "hi" } }, deps)).ok,
      ).toBe(true);
    } finally {
      globalThis.fetch = prev;
    }
  });
});
