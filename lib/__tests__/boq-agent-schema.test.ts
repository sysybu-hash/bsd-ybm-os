import { boqAgentResponseSchema } from "@/lib/boq/boq-agent-schema";

describe("boqAgentResponseSchema", () => {
  it("parses a minimal valid agent response", () => {
    const parsed = boqAgentResponseSchema.parse({
      summary: "הוספת איטום",
      suggestions: [
        {
          action: "add",
          description: "איטום גג",
          unit: "מ\"ר",
          quantity: 120,
        },
      ],
    });
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0]?.action).toBe("add");
  });
});
