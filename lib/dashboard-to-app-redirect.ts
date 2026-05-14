/**
 * מיפוי רשמי מ־/dashboard (legacy) ל־/app (workspace מודרני).
 * query string נשמר אוטומטית דרך clone של nextUrl.
 * יעדים מיושרים ל־`next.config.js` ול־`lib/workspace-canonical-routes.ts`.
 */

/** מניעת לולאת הפניה: אף מטרה לא חוזרת ל־/dashboard */
function finalizeAppTarget(path: string): string {
  const p = (path.trim() || "/app").replace(/\/+$/, "") || "/app";
  if (p === "/dashboard" || p.startsWith("/dashboard/")) {
    return "/app";
  }
  return p;
}

export function mapDashboardPathToApp(pathname: string): string | null {
  if (!pathname.startsWith("/dashboard")) return null;

  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return finalizeAppTarget("/app");
  }

  const rest = pathname.slice("/dashboard".length); // "" or "/foo/..."
  const path = rest.startsWith("/") ? rest : `/${rest}`;

  const exact: Record<string, string> = {
    "/business": "/app/business",
    "/crm": "/app/crm",
    "/clients": "/app/crm",
    "/erp": "/app/erp",
    "/erp/invoice": "/app/erp",
    "/invoice": "/app/erp",
    "/invoices": "/app/erp",
    "/documents": "/app/erp",
    "/scanner": "/app/erp",
    "/ai": "/app",
    "/intelligence": "/app",
    "/settings": "/app/settings/overview",
    "/help": "/app/settings/overview",
    "/admin": "/app/admin",
    "/meckano": "/app/operations/meckano",
    "/operations": "/app/operations",
    "/attendance": "/app/operations/meckano",
    "/executive": "/app",
    "/finance": "/app/erp",
    "/operator": "/app",
    "/control-center": "/app",
    "/success": "/app/success",
    "/advanced": "/app",
    "/projects": "/app/crm?hub=projects",
    "/inbox": "/app",
  };

  if (exact[path]) return finalizeAppTarget(exact[path]);

  if (path.startsWith("/legacy")) {
    const sub = path.replace(/^\/legacy/, "") || "/";
    const legacyMap: Record<string, string> = {
      "/": "/app",
      "/crm": "/app/crm",
      "/clients": "/app/crm",
      "/ai": "/app",
      "/operations": "/app/operations",
      "/finance": "/app/erp",
      "/business": "/app/business",
      "/settings": "/app/settings/overview",
      "/control-center": "/app",
      "/documents": "/app/erp",
      "/invoice": "/app/erp",
    };
    return finalizeAppTarget(legacyMap[sub] ?? "/app");
  }

  if (path === "/trial-expired") {
    return finalizeAppTarget("/app/trial-expired");
  }

  if (path === "/billing") {
    return finalizeAppTarget("/app/settings/billing");
  }

  // ברירת מחדל בטוחה — דשבורד ראשי מודרני
  return finalizeAppTarget("/app");
}
