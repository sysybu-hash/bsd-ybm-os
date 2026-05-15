import { getAssistantNowDisplayHe } from "@/lib/ai/assistant-temporal-context";
import { normalizeConstructionTrade, type ConstructionTradeId } from "@/lib/construction-trades";

/**
 * הוראות מערכת נוספות ל-AI לפי מקצוע בנייה (התאמה ל«השדרה»).
 * משמש להרחבת פרומפטים — לא להחליף את הקשר המלא מהארגון.
 */
const TRADE_INSTRUCTIONS: Partial<Record<ConstructionTradeId, string>> = {
  ELECTRICAL: `
התמחות: עבודות חשמל, תשתיות מתח נמוך וגבוה.
דגשים: חילוץ נתונים על רכיבי חשמל (לוחות, מפסקים, כבלים), בדיקת חריגות במחירי נחושת ורכיבי מיתוג.
הצג למשתמש הערות וטפסים רלוונטיים לחשמלאי/עבודות חשמל כשההקשר מתאים.`,
  GENERAL_CONTRACTOR: `
התמחות: בנייה קבלנית, שלד וגמר.
דגשים: השוואת מחירי בטון, פלדה ועבודות עפר; ניתוח ימי עבודה של קבלני משנה.`,
  PLUMBING: `
התמחות: אינסטלציה ותברואה.
דגשים: חומרי צנרת, אטימות, לחצים, והתאמה לתקנים; השוואת כמויות מול הצעות.`,
  HVAC: `
התמחות: מיזוג אויר ומערכות מכניות.
דגשים: יחידות מיזוג, צנרת קירור/חימום, הספקים ואנרגיה.`,
};

export function getTradeSpecializedPrompt(tradeRaw: string | null | undefined): string {
  const trade = normalizeConstructionTrade(tradeRaw) as ConstructionTradeId;
  const baseInstruction = `אתה עוזר הנדסי בכיר במערכת BSD-YBM. תאריך התייחסות: ${getAssistantNowDisplayHe()}.`;
  const extra = TRADE_INSTRUCTIONS[trade];
  if (!extra?.trim()) {
    return `${baseInstruction}\nהתאם את התשובות לשפה מקצועית בענף הבנייה והתשתיות בישראל.`;
  }
  return `${baseInstruction}
${extra.trim()}
התאם את כל התשובות לשפה המקצועית של התחום הנבחר.`;
}
