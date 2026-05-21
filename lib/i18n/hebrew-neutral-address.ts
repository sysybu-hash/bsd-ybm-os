/**
 * פנייה ניטרלית בעברית — ללא ניחוש מגדר מהשם.
 * משתמשים בלשון רבים ניטרלית: תרצו, תוכלו, בואו.
 */

export function formatHebrewGreetingName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0] ?? trimmed;
  return first;
}

/** הוראות למודל — שפה ניטרלית בעברית */
export function hebrewNeutralLanguageRules(): string {
  return [
    "בעברית: השתמשו בלשון ניטרלית (רבים): «מה תרצו», «אפשר», «בואו נבדוק» — לא «מה תרצה/תרצי».",
    "אל תנחשו מגדר לפי שם המשתמש.",
    "משפטים קצרים; הימנעו ממונולוגים ארוכים.",
  ].join("\n");
}
