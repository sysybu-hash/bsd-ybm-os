import { buildFieldCopilotInstruction } from "@/lib/field-copilot/instruction";
import { getMessages } from "@/lib/i18n/load-messages";
import { coerceLegacyAiToV5, computePriceAlertPending } from "@/lib/scan-schema-v5";

describe("field-copilot analyze", () => {
  it("builds QUOTE_BOQ instruction with site context", () => {
    const messages = getMessages("he");
    const instruction = buildFieldCopilotInstruction({
      localeLang: "Hebrew",
      industry: "CONSTRUCTION",
      trade: "GENERAL_CONTRACTOR",
      messages,
      transcript: "צריך לשפץ מטבח",
      userNotes: "ריצוף חדש",
      projectName: "פרויקט דוגמה",
      clientName: "יוסי",
    });

    expect(instruction).toContain("QUOTE_BOQ");
    expect(instruction).toContain("priceAlertPending");
    expect(instruction).toContain("פרויקט דוגמה");
    expect(instruction).toContain("צריך לשפץ מטבח");
  });

  it("zeros line prices for manual entry workflow", () => {
    let extraction = coerceLegacyAiToV5(
      {
        lineItems: [
          { description: "ריצוף", quantity: 12, unitPrice: 150, lineTotal: 1800 },
        ],
      },
      "field-capture",
      "QUOTE_BOQ",
    );

    extraction = {
      ...extraction,
      lineItems: extraction.lineItems.map((row) => ({
        ...row,
        unitPrice: 0,
        lineTotal: 0,
      })),
      priceAlertPending: true,
    };
    extraction.priceAlertPending = computePriceAlertPending(extraction.lineItems);

    expect(extraction.lineItems[0]!.unitPrice).toBe(0);
    expect(extraction.lineItems[0]!.lineTotal).toBe(0);
    expect(extraction.priceAlertPending).toBe(true);
  });
});
