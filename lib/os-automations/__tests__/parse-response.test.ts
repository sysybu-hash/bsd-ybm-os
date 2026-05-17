import { parseActionsJson } from "@/lib/os-automations/parse-response";

describe("parseActionsJson", () => {
  it("parses valid actions JSON", () => {
    const raw = JSON.stringify({
      reply: "בוצע",
      actions: [{ intent: "open_dashboard", params: {} }],
    });
    const parsed = parseActionsJson(raw, "he");
    expect(parsed?.actions).toHaveLength(1);
    expect(parsed?.actions[0].intent).toBe("open_dashboard");
  });

  it("returns null for invalid JSON", () => {
    expect(parseActionsJson("not json", "he")).toBeNull();
  });
});
