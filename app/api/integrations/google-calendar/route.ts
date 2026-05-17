import { withWorkspacesAuth } from "@/lib/api-handler";

/**
 * סטטוס / הכנה לחיבור Google Calendar (OAuth יתווסף בשלב הבא).
 */
export const GET = withWorkspacesAuth(async () => {
  return Response.json({
    connected: false,
    message:
      "חיבור OAuth ל-Google Calendar בפיתוח. לאחר ההפעלה יוצגו כאן סטטוס ואירועים מסונכרנים.",
  });
});
