import { NextResponse } from "next/server";

/**
 * סטטוס / הכנה לחיבור Google Calendar (OAuth יתווסף בשלב הבא).
 */
export async function GET() {
  return NextResponse.json({
    connected: false,
    message:
      "חיבור OAuth ל-Google Calendar בפיתוח. לאחר ההפעלה יוצגו כאן סטטוס ואירועים מסונכרנים.",
  });
}
