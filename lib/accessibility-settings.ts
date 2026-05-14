export const ACCESSIBILITY_STORAGE_KEY = "bsd:accessibility-settings";

export const ACCESSIBILITY_THEME_OPTIONS = [
  { id: "teal", label: "טיל (ברירת מחדל)", color: "#0d9488" },
  { id: "emerald", label: "אמרלד", color: "#059669" },
  { id: "blue", label: "כחול", color: "#2563eb" },
  { id: "amber", label: "ענבר", color: "#d97706" },
  { id: "rose", label: "רוז", color: "#e11d48" },
  { id: "slate", label: "סלייט", color: "#334155" },
] as const;

export type AccessibilityThemeId = (typeof ACCESSIBILITY_THEME_OPTIONS)[number]["id"];
export type AccessibilityFontScale = "default" | "large" | "xlarge";

export type AccessibilitySettings = {
  fontScale: AccessibilityFontScale;
  highContrast: boolean;
  bigCursor: boolean;
  grayscale: boolean;
  reducedMotion: boolean;
  focusRing: boolean;
  lineSpacing: boolean;
  themeColor: AccessibilityThemeId;
};

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  fontScale: "default",
  highContrast: false,
  bigCursor: false,
  grayscale: false,
  reducedMotion: false,
  focusRing: true,
  lineSpacing: false,
  themeColor: "teal",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTheme(themeColor: unknown): AccessibilityThemeId {
  const raw = themeColor === "indigo" ? "teal" : themeColor;
  return ACCESSIBILITY_THEME_OPTIONS.some((option) => option.id === raw)
    ? (raw as AccessibilityThemeId)
    : DEFAULT_ACCESSIBILITY_SETTINGS.themeColor;
}

function normalizeFontScale(fontScale: unknown): AccessibilityFontScale {
  return fontScale === "large" || fontScale === "xlarge" || fontScale === "default"
    ? fontScale
    : DEFAULT_ACCESSIBILITY_SETTINGS.fontScale;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAccessibilitySettings(input: unknown): AccessibilitySettings {
  if (!isPlainObject(input)) {
    return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  }

  return {
    fontScale: normalizeFontScale(input.fontScale),
    highContrast: normalizeBoolean(
      input.highContrast,
      DEFAULT_ACCESSIBILITY_SETTINGS.highContrast,
    ),
    bigCursor: normalizeBoolean(input.bigCursor, DEFAULT_ACCESSIBILITY_SETTINGS.bigCursor),
    grayscale: normalizeBoolean(input.grayscale, DEFAULT_ACCESSIBILITY_SETTINGS.grayscale),
    reducedMotion: normalizeBoolean(
      input.reducedMotion,
      DEFAULT_ACCESSIBILITY_SETTINGS.reducedMotion,
    ),
    focusRing: normalizeBoolean(input.focusRing, DEFAULT_ACCESSIBILITY_SETTINGS.focusRing),
    lineSpacing: normalizeBoolean(input.lineSpacing, DEFAULT_ACCESSIBILITY_SETTINGS.lineSpacing),
    themeColor: normalizeTheme(input.themeColor),
  };
}

export function readStoredAccessibilitySettings(): AccessibilitySettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
    return normalizeAccessibilitySettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  }
}

export function writeStoredAccessibilitySettings(settings: AccessibilitySettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(settings));
}

function hexToRgb(hexColor: string) {
  const cleaned = hexColor.replace("#", "");
  if (cleaned.length !== 6) return "13, 148, 136";

  const red = Number.parseInt(cleaned.slice(0, 2), 16);
  const green = Number.parseInt(cleaned.slice(2, 4), 16);
  const blue = Number.parseInt(cleaned.slice(4, 6), 16);

  return `${red}, ${green}, ${blue}`;
}

function darkenHex(hexColor: string, factor = 0.18) {
  const cleaned = hexColor.replace("#", "");
  if (cleaned.length !== 6) return hexColor;

  const darkenChannel = (value: string) => {
    const channel = Number.parseInt(value, 16);
    const next = Math.max(0, Math.round(channel * (1 - factor)));
    return next.toString(16).padStart(2, "0");
  };

  return `#${darkenChannel(cleaned.slice(0, 2))}${darkenChannel(cleaned.slice(2, 4))}${darkenChannel(cleaned.slice(4, 6))}`;
}

export function applyAccessibilitySettings(
  settings: AccessibilitySettings,
  root: HTMLElement = document.documentElement,
) {
  root.dataset.accessibilityFontScale = settings.fontScale;
  root.classList.toggle("high-contrast", settings.highContrast);
  root.classList.toggle("big-cursor", settings.bigCursor);
  root.classList.toggle("grayscale", settings.grayscale);
  root.classList.toggle("reduce-motion", settings.reducedMotion);
  root.classList.toggle("focus-ring", settings.focusRing);
  root.classList.toggle("line-spacing", settings.lineSpacing);

  const theme =
    ACCESSIBILITY_THEME_OPTIONS.find((option) => option.id === settings.themeColor) ??
    ACCESSIBILITY_THEME_OPTIONS[0];
  const rgb = hexToRgb(theme.color);
  const strongColor = darkenHex(theme.color);

  root.style.setProperty("--primary-brand", theme.color);
  root.style.setProperty("--primary-color", theme.color);
  root.style.setProperty("--primary-hover", strongColor);
  root.style.setProperty("--heading-color", theme.color);
  root.style.setProperty("--primary-rgb", rgb);
  const soft = `rgba(${rgb}, 0.1)`;
  root.style.setProperty("--v2-accent", theme.color);
  root.style.setProperty("--v2-accent-strong", strongColor);
  root.style.setProperty("--v2-accent-soft", soft);
  root.style.setProperty("--axis-clients", theme.color);
  root.style.setProperty("--axis-clients-strong", strongColor);
  root.style.setProperty("--axis-clients-soft", soft);
}
