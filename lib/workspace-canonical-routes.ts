/**
 * נתיבי Workspace פעילים (מול הפניות legacy ב-next.config).
 * מומלץ לקשר מהקוד לכאן כדי למנוע קישורים לנתיבים שמופנים בשרת.
 */
export const WORKSPACE_ROUTES = {
  home: "/app",
  business: "/app/business",
  scan: "/app/scan",
  crm: "/app/crm",
  erp: "/app/erp",
  operations: "/app/operations",
  settingsOverview: "/app/settings/overview",
  settingsBilling: "/app/settings/billing",
  settingsAutomations: "/app/settings/automations",
  success: "/app/success",
  admin: "/app/admin",
  operationsMeckano: "/app/operations/meckano",
  trialExpired: "/app/trial-expired",
} as const;

export type WorkspaceRouteKey = keyof typeof WORKSPACE_ROUTES;
