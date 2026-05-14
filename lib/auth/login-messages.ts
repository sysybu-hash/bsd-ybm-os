/** הודעות שגיאה והסברים — דף כניסה (מפורשות לצורך תרגום/עקביות) */

export const loginErrorMessages: Record<string, string> = {
  Configuration: "בעיית הגדרת שרת (בדוק משתני סביבה ל-Google).",
  AccessDenied: "הגישה נדחתה.",
  Verification: "פג תוקף קישור האימות. נסה שוב.",
  OAuthAccountNotLinked:
    "האימייל כבר קיים במערכת — נסה שוב להתחבר עם Google (אמור להיקשר אוטומטית).",
  CredentialsSignin: "התחברות נכשלה — בדקו אימייל וסיסמה.",
  Default: "התחברות נכשלה. נסה שוב.",
};

export const loginReasonMessages: Record<string, string> = {
  no_account: "אין חשבון פעיל עבור אימייל זה. נא להירשם או לפנות למנהל המערכת.",
  pending: "החשבון ממתין לאישור מנוי על ידי מנהל המערכת.",
  blocked: "התחברות חסומה עבור כתובת זו. פנו למנהל המערכת.",
  allowlist: "כתובת זו אינה ברשימת ההתרה להתחברות. רק חשבונות מורשים יכולים להיכנס.",
};
