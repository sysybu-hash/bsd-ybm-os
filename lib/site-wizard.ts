export type WizardStep = {
  id: string;
  title: string;
  description: string;
  primaryRoute: string;
  routes: string[];
};

export const SITE_WIZARD_STEPS: WizardStep[] = [
  {
    id: "start",
    title: "Start",
    description: "Understand the OS and pick your path.",
    primaryRoute: "/wizard",
    routes: ["/", "/wizard", "/about", "/tutorial", "/contact"],
  },
  {
    id: "join",
    title: "Join",
    description: "Create access and connect your workspace.",
    primaryRoute: "/register",
    routes: ["/register", "/login", "/sign"],
  },
  {
    id: "setup",
    title: "Setup",
    description: "Configure billing and base preferences.",
    primaryRoute: "/app/settings/billing",
    routes: ["/app/settings/billing", "/app/settings/overview", "/app/trial-expired"],
  },
  {
    id: "operate",
    title: "Operate",
    description: "Run daily workflows with CRM, ERP, and AI.",
    primaryRoute: "/app",
    routes: [
      "/app",
      "/app/scan",
      "/app/settings/overview",
      "/app/crm",
      "/app/erp",
      "/app/admin",
      "/app/operations",
      "/app/success",
    ],
  },
];

function normalizePath(pathname: string): string {
  const clean = pathname.split("?")[0].split("#")[0];
  if (clean.length > 1 && clean.endsWith("/")) {
    return clean.slice(0, -1);
  }
  return clean || "/";
}

function pathMatchesRoute(pathname: string, route: string): boolean {
  const p = normalizePath(pathname);
  const r = normalizePath(route);
  if (p === r) return true;
  if (r === "/") return p === "/";
  return p.startsWith(`${r}/`);
}

export function findWizardStepIndex(pathname: string): number {
  const idx = SITE_WIZARD_STEPS.findIndex((step) =>
    step.routes.some((route) => pathMatchesRoute(pathname, route)),
  );
  return idx >= 0 ? idx : 0;
}

export function findWizardStep(pathname: string): WizardStep {
  return SITE_WIZARD_STEPS[findWizardStepIndex(pathname)];
}

export function getAdjacentWizardRoute(
  pathname: string,
  direction: "prev" | "next",
): string | null {
  const current = findWizardStepIndex(pathname);
  const target = direction === "prev" ? current - 1 : current + 1;
  if (target < 0 || target >= SITE_WIZARD_STEPS.length) return null;
  return SITE_WIZARD_STEPS[target].primaryRoute;
}

