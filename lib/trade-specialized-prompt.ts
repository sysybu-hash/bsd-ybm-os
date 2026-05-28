import { getAssistantNowDisplayHe } from "@/lib/ai/assistant-temporal-context";
import { getMergedIndustryConfig } from "@/lib/construction-trades";

export function getTradeSpecializedPrompt(
  tradeRaw: string | null | undefined,
  industryRaw?: string | null,
): string {
  const config = getMergedIndustryConfig(industryRaw ?? "CONSTRUCTION", tradeRaw);
  const baseInstruction = `אתה עוזר בכיר במערכת BSD-YBM בתחום ${config.label}. תאריך התייחסות: ${getAssistantNowDisplayHe()}.`;
  const extra = config.aiInstructions?.trim();
  if (!extra) {
    return `${baseInstruction}\nהתאם את התשובות לשפה מקצועית בתחום הנבחר.`;
  }
  return `${baseInstruction}\n${extra}\nהתאם את כל התשובות לשפה המקצועית של התחום הנבחר.`;
}
