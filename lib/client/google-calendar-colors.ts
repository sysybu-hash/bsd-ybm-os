/** סגנון אירוע לפי צבע יומן Google (#rrggbb). */

export type CalendarColorStyle = {
  borderColor: string;
  backgroundColor: string;
  color: string;
};

const DEFAULT_VIOLET: CalendarColorStyle = {
  borderColor: "rgba(139, 92, 246, 0.45)",
  backgroundColor: "rgba(139, 92, 246, 0.12)",
  color: "rgb(91, 33, 182)",
};

const DEFAULT_EMERALD: CalendarColorStyle = {
  borderColor: "rgba(16, 185, 129, 0.45)",
  backgroundColor: "rgba(16, 185, 129, 0.12)",
  color: "rgb(4, 120, 87)",
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
}

export function calendarColorStyle(
  calendarColor: string | null | undefined,
  isTask: boolean,
): CalendarColorStyle {
  if (isTask) return DEFAULT_EMERALD;
  if (!calendarColor) return DEFAULT_VIOLET;
  const rgb = hexToRgb(calendarColor);
  if (!rgb) return DEFAULT_VIOLET;
  const { r, g, b } = rgb;
  const text =
    relativeLuminance(r, g, b) > 0.55 ? "rgb(15, 23, 42)" : "rgb(248, 250, 252)";
  return {
    borderColor: `rgba(${r}, ${g}, ${b}, 0.55)`,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.18)`,
    color: text,
  };
}

export function calendarAccentBar(calendarColor: string | null | undefined): string {
  if (!calendarColor) return "#8b5cf6";
  const rgb = hexToRgb(calendarColor);
  if (!rgb) return "#8b5cf6";
  return calendarColor;
}
