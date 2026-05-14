/**
 * שלד לסוכן אוטונומי (גבייה / לוביסט בנק). אינטגרציית Gemini מול בקשה בפועל — בהמשך.
 */
export async function runAutonomousAgent(
  type: "COLLECTION" | "LOBBYIST",
  data: { clientName?: string; amount?: number; fee?: number },
) {
  void data;
  void type;

  return {
    action: type,
    message: "הודעה נוסחה בהצלחה ומוכנה לשליחה.",
    status: "PENDING_APPROVAL" as const,
  };
}
