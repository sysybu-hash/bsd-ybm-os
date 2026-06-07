import type { MessageTree } from "@/lib/i18n/keys";
import { industryInstructionExtras, localeLang } from "@/lib/tri-engine-extract-helpers";

describe("tri-engine-extract-helpers", () => {
  it("localeLang defaults to Hebrew for he", () => {
    expect(localeLang("he")).toMatch(/Hebrew|עברית/i);
  });

  it("industryInstructionExtras includes industry label", () => {
    const messages = {} as MessageTree;
    const block = industryInstructionExtras("CONSTRUCTION", "GENERAL_CONTRACTOR", messages);
    expect(block).toContain("CONTEXT");
    expect(block).toContain("DYNAMIC FIELDS");
  });
});
