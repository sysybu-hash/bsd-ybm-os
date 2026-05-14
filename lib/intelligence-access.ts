import { isAdmin } from "@/lib/is-admin";

/** רכיבי Intelligence לפי תפקיד — ניתן להרחיב כאן מפת מודולים */

export type IntelligenceModuleId =
  | "hub"
  | "forecast_chart"
  | "forecast_simulator"
  | "simulation_mode"
  | "voice"
  | "profitability"
  | "project_guardian"
  | "interactive_pulse"
  | "valuation"
  | "sentiment_demo";

const ALL_MODULES: IntelligenceModuleId[] = [
  "hub",
  "forecast_chart",
  "forecast_simulator",
  "simulation_mode",
  "voice",
  "profitability",
  "project_guardian",
  "interactive_pulse",
  "valuation",
  "sentiment_demo",
];

/** סדר תצוגה בדף המודולים */
export const INTELLIGENCE_MODULE_ORDER: IntelligenceModuleId[] = [...ALL_MODULES];

export function intelligenceModulesForRole(role: string | undefined): IntelligenceModuleId[] {
  switch (role) {
    case "SUPER_ADMIN":
      return [...ALL_MODULES];
    case "ORG_ADMIN":
      return [
        "hub",
        "forecast_chart",
        "forecast_simulator",
        "simulation_mode",
        "voice",
        "profitability",
        "project_guardian",
        "interactive_pulse",
        "valuation",
        "sentiment_demo",
      ];
    case "PROJECT_MGR":
      return [
        "forecast_chart",
        "forecast_simulator",
        "simulation_mode",
        "profitability",
        "valuation",
      ];
    case "EMPLOYEE":
    case "CLIENT":
    default:
      return [];
  }
}

export function canAccessIntelligenceDashboard(role: string | undefined): boolean {
  return intelligenceModulesForRole(role).length > 0;
}

/**
 * דוח Executive גלובלי — רק OS Owner (sysybu@gmail.com).
 */
export function canAccessExecutiveSuite(
  _role: string | undefined,
  email?: string | null | undefined,
): boolean {
  void _role;
  return isAdmin(email);
}
