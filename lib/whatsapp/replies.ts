/** תבניות תשובה ל-WhatsApp — טהורות, ללא תלות בשרת (נבדקות ביחידה). */

export function replyLinked(): string {
  return "✅ המספר חובר לארגון בהצלחה. שלחו צילום של חשבונית או קבלה ואסרוק אותה אוטומטית.";
}

export function replyUnknownNumber(): string {
  return "מספר זה אינו מקושר לארגון. היכנסו לאפליקציית BSD-YBM → הגדרות → WhatsApp, הפיקו קוד חד-פעמי ושלחו אותו כאן.";
}

export function replyNeedCode(): string {
  return "כדי לחבר את המספר, הפיקו קוד חד-פעמי באפליקציה (הגדרות → WhatsApp) ושלחו אותו כאן.";
}

export function replyBadCode(): string {
  return "הקוד שגוי או שפג תוקפו. הפיקו קוד חדש באפליקציה ונסו שוב.";
}

export function replyScanResult(vendor: string, total: number): string {
  const amount =
    total > 0
      ? total.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 })
      : "—";
  return `התקבל ✓\nספק: ${vendor || "לא זוהה"}\nסכום: ${amount}\nהמסמך נשמר במערכת.`;
}

export function replyScanQueued(): string {
  return "התקבל ✓ המסמך בעיבוד — התוצאה תופיע במערכת בעוד רגע.";
}

export function replyUnsupported(): string {
  return "אפשר לשלוח כאן צילום חשבונית (תמונה) או קובץ PDF לסריקה.";
}
