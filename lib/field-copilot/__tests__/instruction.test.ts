import { getFieldCopilotLivePrompt } from "@/lib/field-copilot/instruction";

describe("getFieldCopilotLivePrompt", () => {
  it("returns Hebrew guidance for he locale", () => {
    const prompt = getFieldCopilotLivePrompt("he");
    expect(prompt).toMatch(/Hebrew|עברית|בעברית/i);
    expect(prompt).toMatch(/אל תמציא|Do not invent/i);
  });

  it("returns English guidance for en locale", () => {
    const prompt = getFieldCopilotLivePrompt("en");
    expect(prompt).toContain("English");
    expect(prompt).toMatch(/Do not invent/i);
  });

  it("returns Russian guidance for ru locale", () => {
    const prompt = getFieldCopilotLivePrompt("ru");
    expect(prompt).toContain("Russian");
    expect(prompt).toMatch(/Не выдумывайте/i);
  });
});
