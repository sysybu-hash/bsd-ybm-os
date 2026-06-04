/** נתיבים שבהם דף הנחיתה השיווקי (וידאו + LCP poster) — ללא SW וללא PostHog לפני consent */
export function isMarketingPublicShellPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return p === "/" || p.startsWith("/marketing-preview");
}

/** נתיבים ציבוריים קלים (בלוג, יצירת קשר) — ללא workspace */
export function isMarketingContentPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return (
    isMarketingPublicShellPath(p) ||
    p === "/blog" ||
    p.startsWith("/blog/") ||
    p === "/contact"
  );
}
