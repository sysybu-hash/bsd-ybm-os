/** הודעות שגיאה והסברים — דף כניסה (מפורשות לצורך תרגום/עקביות) */

export const loginErrorMessages: Record<string, string> = {
  Configuration: "בעיית הגדרת שרת (בדוק משתני סביבה ל-Google).",
  AccessDenied: "הגישה נדחתה.",
  Verification: "פג תוקף קישור האימות. נסה שוב.",
  OAuthAccountNotLinked:
    "האימייל כבר קיים במערכת — נסה שוב להתחבר עם Google (אמור להיקשר אוטומטית).",
  Callback:
    "התחברות עם Google נכשלה בשלב החזרה לשרת. נסו שוב בעוד דקה; אם נמשך — פנו למנהל המערכת.",
  OAuthCallback:
    "התחברות עם Google נכשלה (בדרך כלל בגלל כתובת לא עקבית או Service Worker ישן). נסו מ-www.bsd-ybm.co.il, נקו SW בדפדפן, או נסו שוב בעוד דקה.",
  OAuthSignin:
    "לא ניתן להתחיל התחברות עם Google. נסו שוב או פנו למנהל המערכת.",
  redirect_uri_mismatch:
    "כתובת החזרה ל-Google לא תואמת (redirect_uri_mismatch). התחברו דרך https://www.bsd-ybm.co.il בלבד.",
  CredentialsSignin: "התחברות נכשלה — בדקו אימייל וסיסמה.",
  Default: "התחברות נכשלה. נסה שוב.",
};

export const loginReasonMessages: Record<string, string> = {
  no_account: "אין חשבון פעיל עבור אימייל זה. נא להירשם או לפנות למנהל המערכת.",
  pending: "החשבון ממתין לאישור מנהל המערכת. לאחר האישור תוכלו להתחבר עם האימייל והסיסמה — בדרך כלל עד יום עסקים אחד.",
  blocked: "התחברות חסומה עבור כתובת זו. פנו למנהל המערכת.",
  allowlist: "כתובת זו אינה ברשימת ההתרה להתחברות. רק חשבונות מורשים יכולים להיכנס.",
  no_password: "לא הוגדרה סיסמה לחשבון זה. התחברו עם Google או הגדירו סיסמה בהגדרות.",
};
