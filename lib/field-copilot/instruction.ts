import type { MessageTree } from "@/lib/i18n/keys";
import { getMergedIndustryConfig } from "@/lib/construction-trades";
import { buildV5JsonInstruction } from "@/lib/scan-schema-v5";

export function buildFieldCopilotInstruction(input: {
  localeLang: string;
  industry: string;
  trade: string | null;
  messages: MessageTree;
  transcript?: string | null;
  userNotes?: string | null;
  projectName?: string | null;
  clientName?: string | null;
}): string {
  const cfg = getMergedIndustryConfig(input.industry, input.trade, input.messages);
  const v5 = buildV5JsonInstruction(input.localeLang, "QUOTE_BOQ", input.industry);

  const contextLines = [
    `### FIELD SITE CONTEXT`,
    `Trade / industry: ${cfg.label}`,
    cfg.aiInstructions,
    input.projectName ? `Project: ${input.projectName}` : null,
    input.clientName ? `Client: ${input.clientName}` : null,
    input.transcript?.trim() ? `Contractor voice description:\n${input.transcript.trim().slice(0, 4000)}` : null,
    input.userNotes?.trim() ? `Contractor notes:\n${input.userNotes.trim().slice(0, 2000)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${v5}

${contextLines}

### FIELD COPILOT RULES
- You analyze photos/video keyframes + voice transcript from a construction site visit.
- Populate "billOfQuantities" with measurable work items (description, quantity, unit).
- Populate "lineItems" for priced proposal rows — set unitPrice to 0 and lineTotal to 0 (contractor fills prices manually).
- Set "priceAlertPending": true always (manual pricing required).
- Add a concise "summary" scope description in ${input.localeLang}.
- Also return a root-level JSON array field "assumptions" (3–8 strings) listing uncertainties or items needing site verification.
- docType should be "QUOTE" or "BOQ" as appropriate.
- Human-readable strings in ${input.localeLang}.`;
}

export const FIELD_COPILOT_LIVE_PROMPT =
  "אתה עוזר לקבלן בשטח. הזמן אותו לתאר את העבודה הנדרשת: היקף, חומרים, מיקום, בעיות באתר. דבר בעברית קצרה וברורה.";
