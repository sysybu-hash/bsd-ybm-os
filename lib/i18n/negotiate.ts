import {
  DEFAULT_LOCALE,
  PRIMARY_UI_LOCALES,
  type AppLocale,
} from "./config";

/**
 * בחירת שפה מ־Accept-Language: רק he | en | ru לפי סדר העדפות;
 * אחרת ברירת מחדל (en).
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): AppLocale {
  if (!acceptLanguage?.trim()) {
    return DEFAULT_LOCALE;
  }

  const parts = acceptLanguage.split(",").map((chunk) => {
    const [rawTag, ...rest] = chunk.trim().split(";");
    const tag = (rawTag ?? "").trim().toLowerCase();
    let q = 1;
    for (const r of rest) {
      const m = r.trim().match(/^q\s*=\s*([\d.]+)/i);
      if (m?.[1]) q = parseFloat(m[1]);
    }
    return { tag, q: Number.isFinite(q) ? q : 1 };
  });

  parts.sort((a, b) => b.q - a.q);

  for (const { tag } of parts) {
    if (!tag) continue;
    const base = tag.split("-")[0]?.toLowerCase() ?? "";
    const candidate = base === "iw" ? "he" : base === "ar" ? "en" : base;
    if ((PRIMARY_UI_LOCALES as readonly string[]).includes(candidate)) {
      return candidate as AppLocale;
    }
  }

  return DEFAULT_LOCALE;
}
