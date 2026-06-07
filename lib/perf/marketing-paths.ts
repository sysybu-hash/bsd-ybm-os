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
const LIGHT_PUBLIC_PATHS = new Set([
  "/about",
  "/contact",
  "/help",
  "/privacy",
  "/terms",
  "/legal",
  "/login",
  "/register",
  "/integrations/google",
  "/unsubscribe",
]);

export function isMarketingContentPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  if (isWorkspaceShellPath(p)) return false;
  return (
    isMarketingPublicShellPath(p) ||
    p === "/blog" ||
    p.startsWith("/blog/") ||
    LIGHT_PUBLIC_PATHS.has(p)
  );
}
