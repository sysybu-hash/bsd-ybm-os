/** נתיבים שבהם דף הנחיתה השיווקי (וידאו + LCP poster) — ללא SW וללא PostHog לפני consent */
export function isMarketingPublicShellPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return p === "/" || p.startsWith("/marketing-preview");
}

/** מרחב עבודה פעיל (כולל rewrite מ־`/` למנויים מחוברים) */
export function isWorkspaceShellPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return p === "/workspace" || p.startsWith("/workspace/");
}

/** האם לדלג על רישום Service Worker */
export function shouldSkipServiceWorkerRegistration(
  pathname: string,
  workspaceActiveOnMarketingShell = false,
): boolean {
  if (isWorkspaceShellPath(pathname)) return false;
  if (isMarketingPublicShellPath(pathname)) {
    return !workspaceActiveOnMarketingShell;
  }
  return false;
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
