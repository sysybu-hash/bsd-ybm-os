/**
 * גבייה אוטומטית (WhatsApp + Gemini) — דורש מודל חשבוניות ושירות הודעות.
 * אל תייבא מ-prisma עד שיהיו טבלאות Invoice / Client תואמות.
 */
export async function sendCollectionRequest(_invoiceId: string): Promise<void> {
  throw new Error(
    "sendCollectionRequest: לא ממומש — הוסף מודל חשבוניות ואינטגרציית WhatsApp",
  );
}
