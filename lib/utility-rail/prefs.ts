export type UtilityRailTab = "zmanim" | "calculator" | "currency";
export type CalcMode = "basic" | "scientific";

const STORAGE_KEY = "bsd_ybm_utility_rail_v1";

export type UtilityRailPrefs = {
  lastTab: UtilityRailTab;
  calcMode: CalcMode;
};

const DEFAULT_PREFS: UtilityRailPrefs = {
  lastTab: "zmanim",
  calcMode: "basic",
};

export function readUtilityRailPrefs(): UtilityRailPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UtilityRailPrefs>;
    const lastTab =
      parsed.lastTab === "calculator" || parsed.lastTab === "currency" || parsed.lastTab === "zmanim"
        ? parsed.lastTab
        : DEFAULT_PREFS.lastTab;
    const calcMode = parsed.calcMode === "scientific" ? "scientific" : "basic";
    return { lastTab, calcMode };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeUtilityRailPrefs(patch: Partial<UtilityRailPrefs>): UtilityRailPrefs {
  const next = { ...readUtilityRailPrefs(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}
